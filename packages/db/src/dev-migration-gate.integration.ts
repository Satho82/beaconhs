/** Disposable cloud-only regression. No infrastructure or persistent target access. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { pinnedMigrationDatabase } from './migration-connection'
import { executePendingMigrations, loadMigrationBodies } from './migration-execution'
import {
  sourceMigrations,
  strictPrefix,
  schemaFingerprint,
  readLedger,
  ledgerFingerprint,
  verifyState,
  dataFingerprint,
  type Query,
  type ReleaseEvidence,
} from './dev-migration-gate'

if (process.env.CI !== 'true' || process.env.DEV_GATE_DISPOSABLE !== 'true')
  throw new Error('Explicit disposable CI context required')
const root = fileURLToPath(new URL('..', import.meta.url))
const repo = resolve(root, '../..')
const source = '937242e7e35806acab48c28c4163719b00c0f16d'
const work = mkdtempSync(resolve(tmpdir(), 'uvanoo-dev-gate-'))
const admin = postgres('postgresql://postgres:postgres@127.0.0.1:5432/postgres', {
  max: 1,
  onnotice: () => undefined,
})
const databases: string[] = []
const queryFor =
  (client: ReturnType<typeof postgres>): Query =>
  async (s) =>
    Array.from(await client.unsafe(s)) as Record<string, unknown>[]
const q = (name: string) => '"' + name.replaceAll('"', '""') + '"'
try {
  cpSync(resolve(root, 'src'), resolve(work, 'src'), { recursive: true })
  cpSync(resolve(root, 'drizzle'), resolve(work, 'drizzle'), { recursive: true })
  symlinkSync(resolve(root, 'node_modules'), resolve(work, 'node_modules'), 'dir')
  writeFileSync(resolve(work, 'package.json'), '{"type":"module"}')
  for (const file of [
    '0062_approvals_batch01.sql',
    '0063_approvals_production.sql',
    'meta/_journal.json',
  ]) {
    writeFileSync(
      resolve(work, 'drizzle', file),
      execFileSync('git', ['show', source + ':packages/db/drizzle/' + file], { cwd: repo }),
    )
  }
  // This disposable fixture is intentionally frozen at the governed 0063 source.
  // Remove later candidate migrations copied with the working tree before
  // validating that historical source and journal together.
  rmSync(resolve(work, 'drizzle', '0064_inspection_calendar_schedules.sql'))
  rmSync(resolve(work, 'drizzle', '0065_handover_operational_metrics.sql'))
  const folder = resolve(work, 'drizzle')
  const fullJournal = readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8')
  const all = sourceMigrations(folder)
  assert.equal(all.length, 63)
  for (const prefix of [58, 61, 62, 63]) {
    const name = 'dev_gate_fixture_' + prefix
    databases.push(name)
    await admin.unsafe('CREATE DATABASE ' + q(name) + ' OWNER beaconhs_owner')
    const setup = postgres('postgresql://postgres:postgres@127.0.0.1:5432/' + name, {
      max: 1,
      onnotice: () => undefined,
    })
    await setup.unsafe(
      'ALTER SCHEMA public OWNER TO beaconhs_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC',
    )
    await setup.end()
    const url = (role: string) => 'postgresql://' + role + ':' + role + '@127.0.0.1:5432/' + name
    const env = {
      ...process.env,
      FEATURE_CANDIDATE_VERIFIED: 'false',
      MIGRATION_DATABASE_URL: url('beaconhs_migrator'),
      DATABASE_URL: url('beaconhs_app'),
      SUPERADMIN_DATABASE_URL: url('beaconhs_super'),
    }
    const journal = JSON.parse(fullJournal)
    journal.entries = journal.entries.slice(0, prefix)
    writeFileSync(resolve(folder, 'meta/_journal.json'), JSON.stringify(journal))
    // Construct each historical state with its own runner and RLS installer.
    // The current Approvals installer correctly rejects absent pre-0062 tables.
    const baselineSource =
      prefix < 62
        ? 'd18f635a41f092e9e86aa6f53518f9c28992b0d2'
        : prefix === 62
          ? 'c306bd6bbe0571eeca18a410c1ac08fe55c524b6'
          : source
    for (const file of ['migrate.ts', 'rls.ts'])
      writeFileSync(
        resolve(work, 'src', file),
        execFileSync('git', ['show', baselineSource + ':packages/db/src/' + file], { cwd: repo }),
      )
    execFileSync(process.execPath, ['--import', 'tsx', resolve(work, 'src/migrate.ts')], {
      cwd: root,
      env,
      stdio: 'pipe',
    })
    cpSync(resolve(root, 'src'), resolve(work, 'src'), { recursive: true })
    writeFileSync(resolve(folder, 'meta/_journal.json'), fullJournal)
    const client = postgres(url('beaconhs_migrator'), { max: 1, onnotice: () => undefined })
    const reserved = await client.reserve()
    const db = pinnedMigrationDatabase(reserved)
    const query: Query = async (s) =>
      Array.from(await reserved.unsafe(s)) as Record<string, unknown>[]
    await reserved.unsafe('SET ROLE beaconhs_owner')
    const rows = await readLedger(query)
    assert.equal(strictPrefix(all, rows), prefix)
    const before = await schemaFingerprint(query)
    const [id] = await query(
      "SELECT current_database() name,(SELECT oid::integer FROM pg_database WHERE datname=current_database()) oid,current_setting('server_version_num') version",
    )
    const evidence = {
      database: name,
      databaseOid: id!.oid,
      postgresVersion: id!.version,
      schemas: { [prefix]: before },
      backup: { ledgerHash: ledgerFingerprint(rows), schemaHash: before },
    } as ReleaseEvidence
    await verifyState(query, evidence, all, false)
    await reserved.unsafe('CREATE TABLE public.unrecorded_drift(id integer)')
    await assert.rejects(() => verifyState(query, evidence, all, false), /drift/)
    await reserved.unsafe('DROP TABLE public.unrecorded_drift')
    await reserved.unsafe('GRANT DELETE ON risk_assessments TO PUBLIC')
    await assert.rejects(() => verifyState(query, evidence, all, false), /drift/)
    await reserved.unsafe('REVOKE DELETE ON risk_assessments FROM PUBLIC')
    await verifyState(query, evidence, all, false)
    await admin.unsafe('GRANT beaconhs_owner TO beaconhs_backup')
    try {
      await assert.rejects(() => verifyState(query, evidence, all, false), /drift/)
    } finally {
      await admin.unsafe('REVOKE beaconhs_owner FROM beaconhs_backup')
    }
    if (prefix >= 61) {
      await reserved.unsafe(
        'ALTER TABLE risk_assessment_versions DISABLE TRIGGER risk_assessment_versions_immutable_row',
      )
      await assert.rejects(() => verifyState(query, evidence, all, false), /drift/)
      await reserved.unsafe(
        'ALTER TABLE risk_assessment_versions ENABLE TRIGGER risk_assessment_versions_immutable_row',
      )
    }
    await reserved.unsafe("SELECT pg_advisory_lock(hashtext('beaconhs:schema-migration'))")
    const pending = await executePendingMigrations(db, loadMigrationBodies(folder, all))
    assert.equal(pending.length, 63 - prefix)
    await reserved.unsafe("SELECT pg_advisory_unlock(hashtext('beaconhs:schema-migration'))")
    reserved.release()
    await client.end()
    // Run the complete convergence path; target security must survive it.
    execFileSync(process.execPath, ['--import', 'tsx', resolve(work, 'src/migrate.ts')], {
      cwd: root,
      env,
      stdio: 'pipe',
    })
    const verify = postgres(url('beaconhs_migrator'), { max: 1, onnotice: () => undefined })
    await verify.unsafe('SET ROLE beaconhs_owner')
    const verifyQuery = queryFor(verify)
    const finalRows = await readLedger(verifyQuery)
    assert.equal(strictPrefix(all, finalRows), 63)
    evidence.schemas['63'] = await schemaFingerprint(verifyQuery)
    await verifyState(verifyQuery, evidence, all, true)
    const [security] = await verify.unsafe(
      "SELECT NOT has_table_privilege('beaconhs_app','risk_assessment_versions','UPDATE,DELETE,TRUNCATE') risk, NOT has_table_privilege('beaconhs_app','approval_requests','UPDATE') approval, has_column_privilege('beaconhs_app','approval_requests','status','UPDATE') status, NOT has_column_privilege('beaconhs_app','approval_requests','requester_id','UPDATE') requester, has_table_privilege('beaconhs_backup','approval_activity','SELECT') backup, NOT has_table_privilege('beaconhs_backup','approval_activity','INSERT,UPDATE,DELETE,TRUNCATE') backup_readonly",
    )
    assert.ok(security && Object.values(security).every((v) => v === true))
    await verify.end()
    const backup = postgres(url('beaconhs_backup'), { max: 1, onnotice: () => undefined })
    const firstData = await dataFingerprint(queryFor(backup))
    assert.equal(firstData, await dataFingerprint(queryFor(backup)))
    await backup.end()
    console.log(
      'PASS canonical ' +
        prefix +
        ' -> 63, exact ledger, schema/ACL drift rejection and Risk/Approvals/backup protections',
    )
  }
} finally {
  for (const name of databases)
    await admin.unsafe('DROP DATABASE IF EXISTS ' + q(name) + ' WITH (FORCE)')
  await admin.end()
  rmSync(work, { recursive: true, force: true })
}
