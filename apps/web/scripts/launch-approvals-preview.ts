// Starts ONLY the local Next app and a loopback bridge to the already-running
// labelled Batch 01 fixture. Never starts Docker, runs migrations, or resets data.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { hashPassword } from 'better-auth/crypto'
import { createClient } from '@beaconhs/db/client'
import {
  PREVIEW_PEOPLE,
  PREVIEW_PROPERTY,
  PREVIEW_TENANT,
} from '../src/lib/approvals/preview-fixtures'

const container = 'uvanoo-approvals-reconcile-20261012'
const inspected = JSON.parse(
  execFileSync('docker', ['inspect', container], { encoding: 'utf8' }),
)[0]
assert.equal(
  inspected.State.Running,
  true,
  'Start of Docker is not authorised; existing fixture must already be running',
)
assert.equal(inspected.Config.Labels['uvanoo.task'], 'approvals-migration-reconciliation')
assert.equal(inspected.HostConfig.NetworkMode, 'none')
const children = new Set<ReturnType<typeof spawn>>()
const bridge = createServer((socket) => {
  const child = spawn('docker', ['exec', '-i', container, 'nc', '127.0.0.1', '5432'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  children.add(child)
  socket.pipe(child.stdin!)
  child.stdout!.pipe(socket)
  child.stdin!.on('error', () => socket.destroy())
  child.on('error', () => socket.destroy())
  socket.on('error', () => child.kill())
  socket.on('close', () => child.kill())
  child.on('close', () => {
    children.delete(child)
    socket.destroy()
  })
})
await new Promise<void>((resolve, reject) => {
  bridge.once('error', reject)
  bridge.listen(0, '127.0.0.1', resolve)
})
const address = bridge.address()
assert.ok(address && typeof address !== 'string')
const url = (role: string) => `postgresql://${role}@127.0.0.1:${address.port}/reconcile_fixture`
const admin = createClient({ url: url('reconcile_admin'), max: 1 }),
  app = createClient({ url: url('beaconhs_app'), max: 4 })
const password = randomBytes(32).toString('base64url')
const permissions = {
  configurator: ['approvals.read', 'approvals.configure'],
  requester: ['approvals.read', 'approvals.submit'],
  manager: ['approvals.read', 'approvals.decide'],
  finance: ['approvals.read', 'approvals.decide'],
}
try {
  assert.equal((await admin.sql`select current_database() as name`)[0]!.name, 'reconcile_fixture')
  const proposal = (
    await admin.sql`select obj_description('approval_requests'::regclass) as hash`
  )[0]!.hash
  assert.equal(
    proposal,
    'isolated-test-ddl-sha256:9d7e47851e1ddf38335826fe0160099e8839d542d18505f141f36653da8c7780',
  )
  const existing = await admin.sql`SELECT slug FROM tenants WHERE id=${PREVIEW_TENANT}`
  assert.ok(
    !existing.length || existing[0]!.slug === 'approvals-visual-preview',
    'Synthetic identity collision',
  )
  const hash = await hashPassword(password)
  await admin.sql.begin(async (tx) => {
    // Reuse existing fixture database grants; the launcher must not widen them.
    await tx`INSERT INTO tenants(id,slug,name,operational_timezone,branding) VALUES(${PREVIEW_TENANT},'approvals-visual-preview','One Fifty Fenchurch · Synthetic','Europe/London','{"primaryColor":"#ff7165"}'::jsonb) ON CONFLICT(id) DO NOTHING`
    await tx`INSERT INTO hospitality_properties(id,tenant_id,name,code,timezone) VALUES(${PREVIEW_PROPERTY},${PREVIEW_TENANT},'One Fifty Fenchurch','AP-PREVIEW','Europe/London') ON CONFLICT(id) DO NOTHING`
    await tx`INSERT INTO tenant_module_entitlements(tenant_id,module_key,state) VALUES(${PREVIEW_TENANT},'approvals','enabled') ON CONFLICT(tenant_id,module_key) DO NOTHING`
    for (const [key, person] of Object.entries(PREVIEW_PEOPLE)) {
      const role = key as keyof typeof PREVIEW_PEOPLE
      await tx`INSERT INTO "user"(id,email,name,"emailVerified",timezone) VALUES(${person.user},${person.email},${person.name},true,'Europe/London') ON CONFLICT(id) DO NOTHING`
      await tx`INSERT INTO account(id,"userId","accountId","providerId",password,"createdAt","updatedAt") VALUES(${person.user},${person.user},${person.user},'credential',${hash},now(),now()) ON CONFLICT(id) DO UPDATE SET password=EXCLUDED.password`
      await tx`INSERT INTO tenant_users(id,tenant_id,user_id,status,display_name) VALUES(${person.id},${PREVIEW_TENANT},${person.user},'active',${person.name}) ON CONFLICT(id) DO NOTHING`
      const roles =
        await tx`INSERT INTO roles(tenant_id,key,name,permissions) VALUES(${PREVIEW_TENANT},${'preview-' + role},${role === 'configurator' ? 'Workflow configurator' : role === 'requester' ? 'Requester' : role === 'manager' ? 'Line manager' : 'Finance reviewer'},${JSON.stringify(permissions[role])}::jsonb) ON CONFLICT(tenant_id,key) DO UPDATE SET name=EXCLUDED.name RETURNING id`
      await tx`INSERT INTO role_assignments(tenant_id,tenant_user_id,role_id,scope) VALUES(${PREVIEW_TENANT},${person.id},${roles[0]!.id},' {"type":"properties","propertyIds":["a3300000-0000-4000-8000-000000000002"]}'::jsonb) ON CONFLICT(tenant_id,tenant_user_id,role_id) DO NOTHING`
    }
  })
  const workflows =
    await admin.sql`SELECT id FROM approval_workflows WHERE tenant_id=${PREVIEW_TENANT} AND active=true AND jsonb_array_length(stages)=2`
  assert.ok(
    workflows.length,
    'Prepared two-stage preview workflow missing; Requester cannot provision workflows',
  )
  await Promise.all([admin.sql.end(), app.sql.end()])
  const origin = 'http://localhost:3103'
  const next = spawn(
    'pnpm',
    ['exec', 'next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3103'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        UVANOO_APPROVALS_PREVIEW: '1',
        APPROVALS_PREVIEW_PASSWORD: password,
        DATABASE_URL: url('beaconhs_app'),
        SUPERADMIN_DATABASE_URL: url('beaconhs_super'),
        NEXT_PUBLIC_APP_URL: origin,
        APP_URL: origin,
        PUBLIC_APP_URL: origin,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
        BETTER_AUTH_TRUSTED_ORIGINS: origin,
        APP_VERSION: 'V1.4 · Approvals preview',
        SENTRY_ENVIRONMENT: 'isolated-preview',
      },
    },
  )
  console.log(`Synthetic authenticated Approvals preview: ${origin}/preview/approvals/login`)
  console.log(
    'No credentials printed. No DEV connection. Existing fixture reused; no migrations or Docker startup.',
  )
  const stop = () => {
    next.kill('SIGTERM')
    for (const child of children) child.kill()
    bridge.close()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  next.on('exit', () => {
    for (const child of children) child.kill()
    bridge.close()
  })
} catch (error) {
  await Promise.all([admin.sql.end({ timeout: 1 }), app.sql.end({ timeout: 1 })])
  for (const child of children) child.kill()
  bridge.close()
  throw error
}
