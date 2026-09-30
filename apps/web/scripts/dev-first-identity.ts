import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { count, sql } from 'drizzle-orm'
import { createClient, extractRows } from '@beaconhs/db'
import { account, platformAuditLog, sessions, users, verification } from '@beaconhs/db/schema'

type Evidence = {
  host: string
  container: string
  network: string
  containerId: string
  networkId: string
  address: string
}

export function requireFirstIdentityTarget(
  env: Readonly<Record<string, string | undefined>>,
  evidence: Evidence,
) {
  if (
    env.UVANOO_ENVIRONMENT !== 'development' ||
    env.NODE_ENV !== 'development' ||
    env.UVANOO_FIRST_IDENTITY_CONFIRM !== 'CREATE_FIRST_DEV_IDENTITY' ||
    ['APP_ENV', 'DEPLOYMENT_ENV', 'ENVIRONMENT'].some((key) => /prod|stag/i.test(env[key] ?? ''))
  )
    throw new Error('First identity requires explicit, confirmed development execution')
  if (
    evidence.host !== 'vps-c54e0b88' ||
    evidence.container !== 'uvanoo-dev-postgres' ||
    evidence.network !== 'uvanoo-dev-private' ||
    !/^[a-f0-9]{64}$/.test(evidence.containerId) ||
    !/^[a-f0-9]{64}$/.test(evidence.networkId) ||
    !/^172\.\d+\.\d+\.\d+$/.test(evidence.address)
  )
    throw new Error('Missing verified DEV Docker identity')
  for (const [key, role] of [
    ['DATABASE_URL', 'beaconhs_app'],
    ['SUPERADMIN_DATABASE_URL', 'beaconhs_super'],
  ] as const) {
    const url = new URL(env[key] ?? 'invalid:')
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== evidence.container ||
      (url.port && url.port !== '5432') ||
      url.pathname !== '/beaconhs' ||
      url.username !== role ||
      !url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Refusing an unverified DEV database URL')
  }
  if (env.UVANOO_FIRST_IDENTITY_EMAIL !== 'dev.admin@uvanoo.invalid')
    throw new Error('Only the approved fictional first identity is permitted')
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error('A strong DEV auth secret is required')
  const password = env.UVANOO_FIRST_IDENTITY_PASSWORD
  if (!password || password.length < 24 || password.length > 128)
    throw new Error('A private DEV credential of 24–128 characters is required')
  return { email: env.UVANOO_FIRST_IDENTITY_EMAIL, password }
}

class ExistingIdentityError extends Error {}

export function requireEmptyIdentityDatabase(userCount: number) {
  if (!Number.isSafeInteger(userCount) || userCount < 0)
    throw new Error('Identity count is ambiguous')
  if (userCount > 0)
    throw new ExistingIdentityError('REFUSED: authentication identities already exist')
}

export async function provisionFirstIdentity(
  env: Readonly<Record<string, string | undefined>>,
  evidence: Evidence,
) {
  const identity = requireFirstIdentityTarget(env, evidence)
  const client = createClient({ url: env.SUPERADMIN_DATABASE_URL, max: 1 })
  try {
    return await client.db.transaction(async (tx) => {
      const [target] = extractRows(
        await tx.execute(sql`SELECT
        current_database() AS database, current_user AS role,
        host(inet_server_addr()) AS address, r.rolsuper AS superuser
        FROM pg_roles r WHERE r.rolname = current_user`),
      )
      if (
        !target ||
        target.database !== 'beaconhs' ||
        target.role !== 'beaconhs_super' ||
        target.address !== evidence.address ||
        target.superuser !== false
      )
        throw new Error('Connected server does not match the verified DEV target')
      // Serializes against ALL user writers, not just cooperating bootstrap commands.
      // The Better Auth adapter below uses this same transaction and connection.
      await tx.execute(sql`LOCK TABLE "user" IN EXCLUSIVE MODE`)
      const [existing] = await tx.select({ total: count() }).from(users)
      requireEmptyIdentityDatabase(existing?.total ?? -1)
      const auth = betterAuth({
        database: drizzleAdapter(tx, {
          provider: 'pg',
          schema: { user: users, session: sessions, account, verification },
        }),
        secret: env.BETTER_AUTH_SECRET,
        baseURL: 'http://localhost:3000',
        logger: { disabled: true },
        // This instance is local to the CLI transaction; no handler is exported
        // or mounted. The application's two disableSignUp settings stay true.
        emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 24 },
      })
      const created = await auth.api.signUpEmail({
        body: { ...identity, name: 'Uvanoo Development Administrator' },
      })
      await tx.insert(platformAuditLog).values({
        actorUserId: created.user.id,
        entityType: 'development_first_identity',
        entityId: created.user.id,
        action: 'create',
        summary: 'Authorized empty-DEV first identity provisioned through Better Auth',
        metadata: {
          environment: 'development',
          mechanism: 'server-api',
          container: evidence.container,
        },
      })
      return { id: created.user.id, email: created.user.email }
    })
  } finally {
    await client.sql.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = JSON.parse(readFileSync('/run/uvanoo-dev-target.json', 'utf8')) as Evidence
    const identity = await provisionFirstIdentity(process.env, evidence)
    console.log(`DEV first identity created: ${identity.email}`)
  } catch (error) {
    // Never serialize an auth/driver error: it may contain credential parameters.
    console.error(
      error instanceof ExistingIdentityError
        ? 'REFUSED_EXISTING_IDENTITY: first-identity provisioning requires zero users'
        : 'DEV first-identity command refused or failed; no credentials logged',
    )
    process.exitCode = error instanceof ExistingIdentityError ? 3 : 1
  }
}
