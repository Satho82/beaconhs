import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import {
  readMigrationFiles,
  validateMigrationState,
  type MigrationTrackerRow,
} from './migration-state'

const folder = fileURLToPath(new URL('../drizzle', import.meta.url))
const prepared = fileURLToPath(
  new URL('../drizzle/prepared/0059_risk_template_draft_state.sql', import.meta.url),
)
const ownerName = /^[a-z_][a-z0-9_]{0,62}$/

export function isolated0059Statement(): string {
  const text = readFileSync(prepared, 'utf8')
  const statements = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('--') && !line.startsWith('SET '))
  if (
    statements.length !== 1 ||
    statements[0] !== "ALTER TYPE risk_template_state ADD VALUE IF NOT EXISTS 'draft';"
  ) {
    throw new Error('Prepared 0059 must contain only the reviewed enum addition')
  }
  const files = readMigrationFiles(folder)
  if (files.at(-1)?.tag !== '0058_platform_regional_defaults') {
    throw new Error('0059 isolation requires the approved 0058 journal baseline')
  }
  return statements[0].slice(0, -1)
}

type Query = (statement: string) => Promise<Array<Record<string, unknown>>>
type Transaction = (run: (query: Query) => Promise<void>) => Promise<void>

/** 0059 is the only DDL in this transaction. 0060/0061 must use a later transaction. */
export async function runIsolated0059(transaction: Transaction, ownerRole: string): Promise<void> {
  if (!ownerName.test(ownerRole)) throw new Error('Invalid owner role')
  const statement = isolated0059Statement()
  await transaction(async (query) => {
    await query("SET LOCAL lock_timeout = '5s'")
    await query("SET LOCAL statement_timeout = '120s'")
    await query("select pg_advisory_xact_lock(hashtext('beaconhs:schema-migration'))")

    const [role] = await query(`
      select pg_has_role(session_user, '${ownerRole}', 'MEMBER') as can_assume,
             login.rolsuper as login_super, login.rolbypassrls as login_bypass,
             owner.rolcanlogin as owner_login, owner.rolsuper as owner_super,
             owner.rolbypassrls as owner_bypass
      from pg_roles login join pg_roles owner on owner.rolname = '${ownerRole}'
      where login.rolname = session_user
    `)
    if (
      !role?.can_assume ||
      role.login_super ||
      role.login_bypass ||
      role.owner_login ||
      role.owner_super ||
      role.owner_bypass
    ) {
      throw new Error('Migration role preflight failed')
    }
    await query(`SET LOCAL ROLE "${ownerRole}"`)
    await query('SET LOCAL search_path = public, pg_catalog')

    const rows = await query(
      'select hash, created_at from drizzle.__drizzle_migrations order by created_at',
    )
    const state = validateMigrationState(
      readMigrationFiles(folder),
      rows.map((row) => ({
        hash: String(row.hash),
        createdAt: row.created_at as MigrationTrackerRow['createdAt'],
      })),
      { allowLegacyBefore: 1783884000000, requireComplete: true },
    )
    if (state.applied.at(-1)?.tag !== '0058_platform_regional_defaults') {
      throw new Error('0058 is not the applied baseline')
    }
    const [schema] = await query(`
      select to_regclass('public.risk_templates') is not null as templates_exist,
             to_regclass('public.risk_template_families') is null as families_absent,
             to_regclass('public.risk_assessment_versions') is null as versions_absent
    `)
    if (!schema?.templates_exist || !schema.families_absent || !schema.versions_absent) {
      throw new Error('Physical schema is not the isolated 0058 baseline')
    }
    await query(statement)
  })
}

async function main() {
  if (process.argv[2] === '--plan') {
    isolated0059Statement()
    console.log(
      '0059 plan validated: one enum addition in a standalone transaction; no database accessed',
    )
    return
  }
  if (process.argv[2] !== '--apply') throw new Error('Use --plan or --apply')
  if (!process.env.RISK_0059_APPROVAL_ID || !process.env.RISK_0059_RESTORE_REHEARSAL_ID) {
    throw new Error('Separate approval and backup/restore rehearsal references are required')
  }
  const url = process.env.MIGRATION_DATABASE_URL
  if (!url) throw new Error('MIGRATION_DATABASE_URL is required')
  const client = postgres(url, { max: 1, prepare: false })
  try {
    await runIsolated0059(async (run) => {
      await client.begin(async (tx) => {
        await run((statement) => tx.unsafe(statement) as Promise<Array<Record<string, unknown>>>)
      })
    }, process.env.DATABASE_OWNER_ROLE ?? 'beaconhs_owner')
    console.log('Isolated 0059 transaction committed; 0060/0061 were not run')
  } finally {
    await client.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : '0059 runner failed')
    process.exitCode = 1
  })
}
