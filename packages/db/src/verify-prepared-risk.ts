/** Read-only adoption gate for the approved clean DEV database. Never migrate/seed. */
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { readMigrationFiles } from './migration-state'
import { preparedRiskPlan } from './risk-prepared-plan'

const target = 'beaconhs_clean155_final'
type Query = (sql: string) => Promise<Array<Record<string, unknown>>>
type ReadOnly = (run: (query: Query) => Promise<void>) => Promise<void>

export async function verifyPreparedRisk(connections: {
  migration: ReadOnly
  runtime: ReadOnly
  maintenance: ReadOnly
}): Promise<void> {
  // Reuse the historical plan's exact canonical source-identity checks.
  preparedRiskPlan(target)
  const expected = readMigrationFiles(fileURLToPath(new URL('../drizzle', import.meta.url)))
  for (const [kind, connection] of Object.entries(connections)) {
    await connection(async (query) => {
      const [identity] = await query(`SELECT current_database() AS database, session_user AS login,
        current_setting('transaction_read_only') AS read_only, rolsuper, rolbypassrls,
        pg_has_role(session_user,'beaconhs_owner','MEMBER') AS owner_member
        FROM pg_roles WHERE rolname=session_user`)
      const role = {
        migration: 'beaconhs_migrator',
        runtime: 'beaconhs_app',
        maintenance: 'beaconhs_super',
      }[kind]
      if (
        !identity ||
        identity.database !== target ||
        identity.login !== role ||
        identity.read_only !== 'on' ||
        identity.rolsuper !== false ||
        identity.rolbypassrls !== (kind === 'maintenance') ||
        identity.owner_member !== (kind === 'migration')
      )
        throw new Error('Prepared Risk connection identity rejected')
      if (kind === 'migration') {
        await query('SET LOCAL ROLE beaconhs_owner')
        const rows = await query(
          'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
        )
        if (
          rows.length !== 61 ||
          rows.some(
            (r, i) =>
              r.hash !== expected[i]?.hash || Number(r.created_at) !== expected[i]?.createdAt,
          )
        )
          throw new Error('Prepared Risk ledger rejected')
        const [security] = await query(`SELECT
          (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
            AND c.relname IN ('risk_template_families','risk_assessment_versions','risk_assessments','risk_hazards','risk_assessment_signoffs','risk_templates')
            AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='beaconhs_owner')=6
          AND NOT has_table_privilege('beaconhs_app','risk_assessment_versions','UPDATE')
          AND NOT has_table_privilege('beaconhs_app','risk_assessment_versions','DELETE')
          AND NOT has_table_privilege('beaconhs_super','risk_assessment_versions','UPDATE')
          AND NOT has_table_privilege('beaconhs_super','risk_assessment_versions','DELETE')
          AND NOT has_table_privilege('beaconhs_app','risk_assessment_versions','TRUNCATE')
          AND (SELECT count(*) FROM pg_roles WHERE rolname='beaconhs_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)=1
          AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN
            ('risk_assessment_versions_immutable_row','risk_assessment_versions_immutable_truncate','risk_assessment_revision_consistency','risk_hazard_revision_consistency','risk_version_content_consistency','risk_signoff_revision_guard'))=6 AS ready`)
        if (security?.ready !== true) throw new Error('Prepared Risk security rejected')
      }
      if (kind === 'maintenance') {
        const [inventory] = await query(`SELECT
          (SELECT count(*) FROM tenants)=2 AND (SELECT count(*) FROM tenants WHERE status='active' AND name IN ('Cycas Hospitality','Vertiq Hospitality'))=2
          AND (SELECT count(*) FROM "user")=1 AND (SELECT count(*) FROM "user" WHERE "isSuperAdmin" AND disabled_at IS NULL)=1
          AND (SELECT count(*) FROM account WHERE "providerId"='credential')=1
          AND (SELECT count(*) FROM tenant_users)=0 AND (SELECT count(*) FROM hospitality_properties)=3
          AND (SELECT count(*) FROM risk_templates WHERE scope='platform')=50
          AND (SELECT count(*) FROM risk_templates)=50 AS ready`)
        if (inventory?.ready !== true) throw new Error('Prepared Risk inventory rejected')
      }
    })
  }
}

async function main() {
  if (process.env.FEATURE_CANDIDATE_VERIFIED !== 'true') throw new Error('Feature-only verifier')
  const urls = [
    process.env.MIGRATION_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.SUPERADMIN_DATABASE_URL,
  ]
  if (urls.some((url) => !url)) throw new Error('Missing verified connections')
  const clients = urls.map((url) =>
    postgres(url!, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => undefined }),
  )
  const connection =
    (i: number): ReadOnly =>
    async (run) => {
      await clients[i]!.begin('read only', async (tx) => {
        await tx.unsafe("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s'")
        await run(
          (statement) => tx.unsafe(statement) as unknown as Promise<Array<Record<string, unknown>>>,
        )
      })
    }
  try {
    await verifyPreparedRisk({
      migration: connection(0),
      runtime: connection(1),
      maintenance: connection(2),
    })
    console.log('Prepared Risk database verified READ ONLY; no migration or seed executed')
  } finally {
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })))
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      'Prepared Risk verification failed; deployment must stop; protected diagnostics withheld',
    )
    process.exitCode = 1
  })
