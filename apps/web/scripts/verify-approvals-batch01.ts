/** Explicit isolated integration runner. Never accepts a database URL.
 * Requires the retained, labelled, network-none PostgreSQL migration fixture
 * and metadata captured from DEV in a READ ONLY transaction. No DEV connection.
 * Run: APPROVALS_DEV_CONTRACTS=/absolute/path/to/dev-schema-contracts.json
 *      pnpm --filter @beaconhs/web exec tsx scripts/verify-approvals-batch01.ts
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createClient } from '@beaconhs/db/client'
import { sql } from 'drizzle-orm'
import { makeTenantContext, type RequestContext } from '@beaconhs/tenant'
import { RLS_POLICY_SQL } from '@beaconhs/db/rls'
import type { RoleScope } from '@beaconhs/db/schema'
import {
  createApprovalWorkflow,
  decideApproval,
  readApprovalRequest,
  submitApprovalRequest,
} from '../src/lib/approvals/service'
import type { ApprovalAdapters } from '../src/lib/approvals/contracts'

const container = 'uvanoo-approvals-reconcile-20261012'
const database = 'reconcile_fixture'
const inspected = JSON.parse(
  execFileSync('docker', ['inspect', container], { encoding: 'utf8' }),
)[0]
assert.equal(inspected.Config.Labels['uvanoo.task'], 'approvals-migration-reconciliation')
assert.equal(inspected.HostConfig.NetworkMode, 'none')
assert.deepEqual(inspected.HostConfig.PortBindings, {})
assert.equal(inspected.State.Running, true)
assert.ok(process.env.APPROVALS_DEV_CONTRACTS, 'Explicit read-only DEV metadata file required')
type Contract = {
  runtimeReadTables: string[]
  database: string
  readOnly: string
  capturedAt: string
  serverVersion: string
  columns: Array<{
    table_name: string
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
  }>
  constraints: Array<{ table_name: string; conname: string; definition: string }>
  indexes: Array<{ tablename: string; indexname: string; indexdef: string }>
  policies: Array<{
    tablename: string
    policyname: string
    permissive: string
    roles: string[]
    cmd: string
    qual: string | null
    with_check: string | null
  }>
  rls: Array<{
    relname: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
    owner: string
  }>
  grants: Array<{ grantee: string; table_name: string; privilege_type: string }>
  ledger: Array<{ id: number; hash: string; created_at: number }>
}
const evidence = JSON.parse(readFileSync(process.env.APPROVALS_DEV_CONTRACTS!, 'utf8')) as {
  contracts: Contract
}
const dev = evidence.contracts
assert.equal(dev.database, 'beaconhs_clean155_final')
assert.equal(dev.readOnly, 'on')
assert.equal(dev.ledger.length, 61)
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
  child.on('close', () => {
    children.delete(child)
    socket.destroy()
  })
  socket.on('error', () => child.kill())
  socket.on('close', () => child.kill())
})
await new Promise<void>((resolve, reject) => {
  bridge.once('error', reject)
  bridge.listen(0, '127.0.0.1', resolve)
})
const address = bridge.address()
assert.ok(address && typeof address !== 'string')
const admin = createClient({
  url: `postgresql://reconcile_admin@127.0.0.1:${address.port}/${database}`,
  max: 2,
})
const runtime = createClient({
  url: `postgresql://beaconhs_app@127.0.0.1:${address.port}/${database}`,
  max: 8,
})
const results: Array<{ name: string; status: 'PASS' }> = []
async function test(name: string, fn: () => Promise<void>) {
  await fn()
  results.push({ name, status: 'PASS' })
  console.log(`PASS ${name}`)
}
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`
const serial = (rows: unknown) => JSON.parse(JSON.stringify(rows))
const ddl = readFileSync(
  fileURLToPath(new URL('../../../packages/db/proposals/approvals-batch01.sql', import.meta.url)),
  'utf8',
)
const ddlHash = createHash('sha256').update(ddl).digest('hex')
try {
  assert.equal((await admin.sql`select current_database() as db`)[0]!.db, database)
  const role = (
    await runtime.sql`select current_user as name,rolsuper,rolbypassrls from pg_roles where rolname=current_user`
  )[0]!
  assert.equal(role.name, 'beaconhs_app')
  assert.equal(role.rolsuper, false)
  assert.equal(role.rolbypassrls, false)
  const tables = dev.rls.map((r) => r.relname)
  await test('All 61 replayed migration hashes and timestamps equal the observed DEV ledger', async () => {
    const ledger =
      await admin.sql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id`
    assert.deepEqual(
      ledger.map((r) => ({ hash: r.hash, created_at: Number(r.created_at) })),
      dev.ledger.map((r) => ({ hash: r.hash, created_at: Number(r.created_at) })),
    )
  })
  await test('Verified DEV column, constraint and index contracts match replayed baseline', async () => {
    const columns =
      await admin.sql`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ${admin.sql(tables)} ORDER BY table_name,ordinal_position`
    assert.deepEqual(serial(columns), dev.columns)
    const constraints =
      await admin.sql`SELECT c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ${admin.sql(tables)} ORDER BY c.relname,k.conname`
    assert.deepEqual(serial(constraints), dev.constraints)
    const indexes =
      await admin.sql`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ${admin.sql(tables)} ORDER BY tablename,indexname`
    assert.deepEqual(serial(indexes), dev.indexes)
  })
  // Replay the *captured* policy/grant contracts on this fixture only, since the
  // baseline runner installs these separately from its SQL migrations.
  await admin.sql.begin(async (tx) => {
    // Existing audit policies reference other modules even for unrelated entity
    // types. Reproduce their observed read grants, without fabricating access.
    for (const table of ['corrective_actions', 'report_runs']) {
      assert.ok(dev.runtimeReadTables.includes(table))
      await tx.unsafe(`GRANT SELECT ON public.${quote(table)} TO beaconhs_app`)
    }
    for (const table of dev.rls) {
      const name = quote(table.relname)
      await tx.unsafe(
        `ALTER TABLE public.${name} ${table.relrowsecurity ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY`,
      )
      await tx.unsafe(
        `ALTER TABLE public.${name} ${table.relforcerowsecurity ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY`,
      )
      await tx.unsafe(`ALTER TABLE public.${name} OWNER TO ${quote(table.owner)}`)
      const policies =
        await tx`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=${table.relname}`
      for (const policy of policies)
        await tx.unsafe(`DROP POLICY ${quote(String(policy.policyname))} ON public.${name}`)
      for (const p of dev.policies.filter((p) => p.tablename === table.relname)) {
        assert.ok(['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(p.cmd))
        assert.ok(['PERMISSIVE', 'RESTRICTIVE'].includes(p.permissive))
        await tx.unsafe(
          `CREATE POLICY ${quote(p.policyname)} ON public.${name} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(quote).join(',')}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''}`,
        )
      }
      await tx.unsafe(`REVOKE ALL ON public.${name} FROM beaconhs_app`)
      for (const g of dev.grants.filter(
        (g) => g.table_name === table.relname && g.grantee === 'beaconhs_app',
      )) {
        assert.ok(
          ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(
            g.privilege_type,
          ),
        )
        await tx.unsafe(`GRANT ${g.privilege_type} ON public.${name} TO beaconhs_app`)
      }
    }
    await tx.unsafe('GRANT USAGE ON SCHEMA public TO beaconhs_app')
  })
  await test('Captured DEV RLS, ownership and runtime grants installed exactly on fixture dependencies', async () => {
    const policies =
      await admin.sql`SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ${admin.sql(tables)} ORDER BY tablename,policyname`
    assert.deepEqual(serial(policies), dev.policies)
    const rls =
      await admin.sql`SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relname IN ${admin.sql(tables)} ORDER BY relname`
    assert.deepEqual(serial(rls), dev.rls)
    const grants =
      await admin.sql`SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ${admin.sql(tables)} AND grantee='beaconhs_app' ORDER BY table_name,grantee,privilege_type`
    assert.deepEqual(
      serial(grants),
      dev.grants.filter((g) => g.grantee === 'beaconhs_app'),
    )
  })
  await test('Additive unnumbered DDL applies atomically to verified baseline', async () => {
    const present = (await admin.sql`select to_regclass('public.approval_requests') as present`)[0]!
      .present
    if (present) {
      const comment = (
        await admin.sql`select obj_description('public.approval_requests'::regclass) as comment`
      )[0]!.comment
      assert.equal(
        comment,
        `isolated-test-ddl-sha256:${ddlHash}`,
        'Fixture DDL differs: review explicitly; runner never drops/replaces tables',
      )
    } else {
      await admin.sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE beaconhs_owner')
        await tx.unsafe(ddl)
        await tx.unsafe(
          `COMMENT ON TABLE approval_requests IS 'isolated-test-ddl-sha256:${ddlHash}'`,
        )
      })
    }
  })
  // Exercise policy reinstallation, which must not weaken the property policy.
  await admin.db.transaction(async (tx) => {
    for (const t of [
      'approval_workflows',
      'approval_requests',
      'approval_stages',
      'approval_decisions',
      'approval_events',
    ])
      await tx.execute(sql.raw(RLS_POLICY_SQL(t)))
  })
  const tenant = randomUUID(),
    otherTenant = randomUUID(),
    property = randomUUID(),
    otherProperty = randomUUID(),
    foreignProperty = randomUUID()
  const members = Array.from({ length: 6 }, () => ({ id: randomUUID(), user: randomUUID() }))
  const [requester, first, second, unassigned, restricted, outsider] = members as [
    (typeof members)[number],
    (typeof members)[number],
    (typeof members)[number],
    (typeof members)[number],
    (typeof members)[number],
    (typeof members)[number],
  ]
  const permissions = [
    'approvals.read',
    'approvals.configure',
    'approvals.submit',
    'approvals.decide',
  ]
  const tenantRole = randomUUID(),
    foreignRole = randomUUID()
  await admin.sql.begin(async (tx) => {
    for (const id of [tenant, otherTenant]) {
      await tx`INSERT INTO tenants(id,slug,name) VALUES(${id},${'approval-test-' + id},'Isolated approval test')`
      await tx`INSERT INTO tenant_module_entitlements(tenant_id,module_key,state) VALUES(${id},'approvals','enabled')`
    }
    for (const [id, t] of [
      [property, tenant],
      [otherProperty, tenant],
      [foreignProperty, otherTenant],
    ])
      await tx`INSERT INTO hospitality_properties(id,tenant_id,name,code,timezone) VALUES(${id!},${t!},'Isolated test property',${id!},'UTC')`
    for (const [id, t] of [
      [tenantRole, tenant],
      [foreignRole, otherTenant],
    ])
      await tx`INSERT INTO roles(id,tenant_id,key,name,permissions) VALUES(${id!},${t!},'approvals-fixture','Approval fixture',${JSON.stringify(permissions)}::jsonb)`
    for (const m of members) {
      const t = m === outsider ? otherTenant : tenant
      await tx`INSERT INTO "user"(id,email,name) VALUES(${m.user},${m.user + '@example.invalid'},'Isolated approval actor')`
      await tx`INSERT INTO tenant_users(id,tenant_id,user_id,status) VALUES(${m.id},${t},${m.user},'active')`
      const scope =
        m === restricted ? { type: 'properties', propertyIds: [otherProperty] } : { type: 'tenant' }
      await tx`INSERT INTO role_assignments(tenant_id,tenant_user_id,role_id,scope) VALUES(${t},${m.id},${m === outsider ? foreignRole : tenantRole},${JSON.stringify(scope)}::jsonb)`
    }
  })
  function context(
    m: (typeof members)[number],
    scopes: RoleScope[] = [{ type: 'tenant' }],
  ): RequestContext {
    return makeTenantContext(runtime.db, {
      userId: m.user,
      tenantId: m === outsider ? otherTenant : tenant,
      isSuperAdmin: false,
      timezone: 'UTC',
      locale: 'en',
      defaultLocale: 'en',
      enabledLocales: ['en'],
      localeOverride: null,
      membership: { id: m.id, displayName: 'Fixture actor' },
      personId: null,
      permissions: new Set(permissions),
      scopes,
    })
  }
  const submitter = context(requester),
    actor = context(first),
    actor2 = context(second)
  // Test-only resolver: typed adapter contract is exercised; no production adapter is enabled.
  const adapters: ApprovalAdapters = {
    tasks: {
      module: 'tasks',
      resolve: async () => ({
        propertyId: property,
        title: 'Synthetic fixture request',
        version: 'v1',
      }),
    },
  }
  const workflow = await createApprovalWorkflow(submitter, {
    propertyId: property,
    name: 'Two-stage review',
    stages: [
      { name: 'Review', approverId: first.id },
      { name: 'Confirm', approverId: second.id },
    ],
  })
  const submission = () => ({
    workflowId: workflow.id,
    source: { module: 'tasks' as const, id: randomUUID(), version: 'v1' },
    idempotencyKey: randomUUID(),
  })
  const freshRequest = () => submitApprovalRequest(submitter, submission(), adapters)
  const request = await freshRequest()
  const decision = (id: string, stage = 1) => ({
    requestId: id,
    stage,
    decision: 'approve' as const,
    idempotencyKey: randomUUID(),
  })
  await test('Creation idempotency and conflicting payload protection', async () => {
    const input = submission()
    const a = await submitApprovalRequest(submitter, input, adapters)
    assert.deepEqual(await submitApprovalRequest(submitter, input, adapters), a)
    await assert.rejects(
      () =>
        submitApprovalRequest(
          submitter,
          { ...input, source: { ...input.source, id: randomUUID() } },
          adapters,
        ),
      /conflicts/,
    )
  })
  await test('Cross-tenant service and direct RLS access denied', async () => {
    const ctx = context(outsider)
    await assert.rejects(() => decideApproval(ctx, decision(request.id)), /unavailable/)
    await assert.rejects(() => readApprovalRequest(ctx, request.id), /unavailable/)
    assert.equal(
      (
        await ctx.db((tx) =>
          tx.execute(sql`select id from approval_requests where id=${request.id}`),
        )
      ).length,
      0,
    )
  })
  await test('Cross-property service, read and direct RLS access denied', async () => {
    const ctx = context(restricted, [{ type: 'properties', propertyIds: [otherProperty] }])
    await assert.rejects(() => decideApproval(ctx, decision(request.id)), /unavailable/)
    await assert.rejects(() => readApprovalRequest(ctx, request.id), /unavailable/)
    for (const table of [
      'approval_workflows',
      'approval_requests',
      'approval_stages',
      'approval_decisions',
      'approval_events',
    ])
      assert.equal(
        (
          await ctx.db((tx) =>
            tx.execute(sql.raw(`select * from ${table} where property_id='${property}'`)),
          )
        ).length,
        0,
      )
    await assert.rejects(() =>
      ctx.db((tx) =>
        tx.execute(
          sql`insert into approval_workflows(tenant_id,property_id,name,stages) values(${tenant},${property},'Forbidden','[{"name":"x","approverId":"x"}]'::jsonb)`,
        ),
      ),
    )
  })
  await test('Unassigned approver denied', async () => {
    await assert.rejects(
      () => decideApproval(context(unassigned), decision(request.id)),
      /assigned approver/,
    )
  })
  await test('Self-approval denied at submission and decision', async () => {
    await assert.rejects(() => decideApproval(submitter, decision(request.id)), /Self-approval/)
    const self = await createApprovalWorkflow(submitter, {
      propertyId: property,
      name: 'Self test',
      stages: [{ name: 'Review', approverId: requester.id }],
    })
    await assert.rejects(
      () => submitApprovalRequest(submitter, { ...submission(), workflowId: self.id }, adapters),
      /Self-approval/,
    )
  })
  await test('Disabled entitlement denied with no decision or audit side effect', async () => {
    const before =
      await admin.sql`select count(*)::int as n from audit_log where tenant_id=${tenant}`
    await admin.sql`update tenant_module_entitlements set state='disabled' where tenant_id=${tenant} and module_key='approvals'`
    try {
      await assert.rejects(() => decideApproval(actor, decision(request.id)), /disabled/)
    } finally {
      await admin.sql`update tenant_module_entitlements set state='enabled' where tenant_id=${tenant} and module_key='approvals'`
    }
    assert.deepEqual(
      serial(await admin.sql`select count(*)::int as n from audit_log where tenant_id=${tenant}`),
      serial(before),
    )
  })
  await test('Live permission revocation overrides stale request context', async () => {
    await admin.sql`INSERT INTO user_permission_overrides(tenant_id,tenant_user_id,permission,effect) VALUES(${tenant},${first.id},'approvals.decide','deny')`
    try {
      await assert.rejects(() => decideApproval(actor, decision(request.id)), /Missing permission/)
    } finally {
      await admin.sql`DELETE FROM user_permission_overrides WHERE tenant_id=${tenant} AND tenant_user_id=${first.id} AND permission='approvals.decide'`
    }
  })
  await test('Live property revocation overrides stale request context', async () => {
    await admin.sql`UPDATE role_assignments SET scope=${JSON.stringify({ type: 'properties', propertyIds: [otherProperty] })}::jsonb WHERE tenant_user_id=${first.id}`
    try {
      await assert.rejects(
        () => decideApproval(actor, decision(request.id)),
        /Property access denied/,
      )
    } finally {
      await admin.sql`UPDATE role_assignments SET scope='{"type":"tenant"}'::jsonb WHERE tenant_user_id=${first.id}`
    }
  })
  await test('Mandatory rejection reason and sequential workflow transitions', async () => {
    await assert.rejects(() =>
      decideApproval(actor, { ...decision(request.id), decision: 'reject', reason: '   ' }),
    )
    await assert.rejects(() => decideApproval(actor2, decision(request.id, 2)), /not current/)
    const input = decision(request.id)
    const approved = await decideApproval(actor, input)
    assert.deepEqual(await decideApproval(actor, input), approved)
    await assert.rejects(
      () => decideApproval(actor, { ...input, decision: 'reject', reason: 'Conflict' }),
      /conflicts/,
    )
    const pending = await readApprovalRequest(submitter, request.id)
    assert.equal(pending.request.current_stage, 2)
    assert.equal(pending.request.status, 'pending')
    await decideApproval(actor2, decision(request.id, 2))
    assert.equal((await readApprovalRequest(submitter, request.id)).request.status, 'approved')
    await assert.rejects(() => decideApproval(actor2, decision(request.id, 2)), /resolved/)
  })
  await test('Rejection finalises immediately and blocks later stages', async () => {
    const r = await freshRequest()
    await decideApproval(actor, {
      ...decision(r.id),
      decision: 'reject',
      reason: 'Evidence is incomplete',
    })
    const result = await readApprovalRequest(submitter, r.id)
    assert.equal(result.request.status, 'rejected')
    assert.equal(result.events.length, 2)
    await assert.rejects(() => decideApproval(actor2, decision(r.id, 2)), /resolved/)
  })
  await test('Concurrent attempts: exactly one winner and one immutable decision/event', async () => {
    const r = await freshRequest()
    const settled = await Promise.allSettled([
      decideApproval(actor, decision(r.id)),
      decideApproval(actor, decision(r.id)),
    ])
    assert.equal(settled.filter((x) => x.status === 'fulfilled').length, 1)
    assert.equal(settled.filter((x) => x.status === 'rejected').length, 1)
    assert.equal(
      (
        await admin.sql`select count(*)::int as n from approval_decisions where request_id=${r.id}`
      )[0]!.n,
      1,
    )
    assert.equal((await readApprovalRequest(submitter, r.id)).events.length, 2)
  })
  await test('Concurrent identical retries return the same persisted decision', async () => {
    const r = await freshRequest(),
      input = decision(r.id)
    const [a, b] = await Promise.all([decideApproval(actor, input), decideApproval(actor, input)])
    assert.deepEqual(a, b)
  })
  await test('Finalised decision, request and event immutability, including broad runner DML grants', async () => {
    // Simulate unchanged runner grants; trigger invariants must still hold.
    await admin.sql.unsafe(
      'GRANT UPDATE,DELETE ON approval_requests,approval_workflows,approval_stages,approval_decisions,approval_events TO beaconhs_app',
    )
    await assert.rejects(() =>
      actor.db((tx) =>
        tx.execute(
          sql`update approval_decisions set reason='tampered' where request_id=${request.id}`,
        ),
      ),
    )
    await assert.rejects(() =>
      actor.db((tx) =>
        tx.execute(sql`delete from approval_decisions where request_id=${request.id}`),
      ),
    )
    await assert.rejects(() =>
      actor.db((tx) =>
        tx.execute(sql`update approval_requests set status='pending' where id=${request.id}`),
      ),
    )
    await assert.rejects(() =>
      actor.db((tx) =>
        tx.execute(
          sql`update approval_events set evidence='{}'::jsonb where request_id=${request.id}`,
        ),
      ),
    )
    await assert.rejects(() =>
      actor.db((tx) => tx.execute(sql`delete from approval_events where request_id=${request.id}`)),
    )
    await assert.rejects(() => admin.sql.unsafe('TRUNCATE approval_events'))
  })
  await test('Immutable audit snapshots match decisions and survive shared audit projection edits', async () => {
    const before = serial(
      await admin.sql`select evidence from approval_events where request_id=${request.id} and kind='approve' order by occurred_at,id`,
    )
    assert.equal(before.length, 2)
    for (const row of before) {
      assert.equal(row.evidence.audit.entity_id, request.id)
      assert.equal(row.evidence.audit.metadata.decision, row.evidence.decision)
      assert.equal(
        row.evidence.audit.metadata.reasonDigest,
        createHash('sha256').update(row.evidence.reason).digest('hex'),
      )
      assert.ok(row.evidence.audit.actor_user_id)
    }
    await actor.db((tx) =>
      tx.execute(
        sql`update audit_log set summary='projection changed' where entity_type='approval_request' and entity_id=${request.id}`,
      ),
    )
    assert.deepEqual(
      serial(
        await admin.sql`select evidence from approval_events where request_id=${request.id} and kind='approve' order by occurred_at,id`,
      ),
      before,
    )
  })
  await test('Missing audit and invalid direct state transitions roll back', async () => {
    const r = await freshRequest()
    await assert.rejects(() =>
      actor.db((tx) =>
        tx.execute(sql`update approval_requests set status='approved' where id=${r.id}`),
      ),
    )
    await assert.rejects(() =>
      actor.db((tx) =>
        tx.execute(
          sql`insert into approval_decisions(tenant_id,property_id,request_id,position,actor_id,decision,idempotency_key,audit_id,audit_key) values(${tenant},${property},${r.id},1,${first.id},'approve',${randomUUID()},${randomUUID()},'missing-audit')`,
        ),
      ),
    )
    assert.equal((await readApprovalRequest(submitter, r.id)).request.current_stage, 1)
    assert.equal(
      (
        await admin.sql`select count(*)::int as n from approval_decisions where request_id=${r.id}`
      )[0]!.n,
      0,
    )
  })
  await test('Source adapter disabled and property/version mismatch fail closed', async () => {
    await assert.rejects(() => submitApprovalRequest(submitter, submission(), {}), /not enabled/)
    const stale = submission()
    await assert.rejects(
      () =>
        submitApprovalRequest(
          submitter,
          { ...stale, source: { ...stale.source, version: 'stale' } },
          adapters,
        ),
      /mismatch/,
    )
    await assert.rejects(
      () =>
        submitApprovalRequest(submitter, submission(), {
          tasks: {
            module: 'tasks',
            resolve: async () => ({
              propertyId: otherProperty,
              title: 'Wrong source',
              version: 'v1',
            }),
          },
        }),
      /mismatch/,
    )
  })
  await test('No orphan decision audit entries; baseline contracts remain unchanged', async () => {
    const counts = await admin.sql`SELECT
      (SELECT count(*)::int FROM approval_decisions WHERE tenant_id=${tenant}) AS decisions,
      (SELECT count(*)::int FROM approval_events WHERE tenant_id=${tenant} AND kind<>'submitted') AS events,
      (SELECT count(*)::int FROM audit_log WHERE tenant_id=${tenant} AND entity_type='approval_request' AND action='sign') AS audits`
    assert.equal(counts[0]!.decisions, counts[0]!.events)
    assert.equal(counts[0]!.decisions, counts[0]!.audits)
    const constraints =
      await admin.sql`SELECT c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ${admin.sql(tables)} ORDER BY c.relname,k.conname`
    assert.deepEqual(serial(constraints), dev.constraints)
  })
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        tests: results.length,
        results,
        container,
        database,
        role: role.name,
        ddlSha256: ddlHash,
        devCapturedAt: dev.capturedAt,
        devServerVersion: dev.serverVersion,
        fixtures: 'synthetic records only; retained; no DEV writes',
      },
      null,
      2,
    ),
  )
} finally {
  await Promise.all([runtime.sql.end({ timeout: 2 }), admin.sql.end({ timeout: 2 })])
  for (const child of children) child.kill()
  await new Promise<void>((resolve) => bridge.close(() => resolve()))
}
