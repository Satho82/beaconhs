/** Explicit disposable-container-only integration harness. No environment database URLs. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { executePendingMigrations, loadMigrationBodies } from './migration-execution'
import {
  prepareMigrationPrivileges,
  grantUnmanagedObjects,
  grantBackupReadAccess,
} from './migration-privileges'
import { readMigrationFiles } from './migration-state'
import { preparedRiskProposals } from './risk-prepared-plan'
import { pinnedMigrationDatabase } from './migration-connection'
import { RLS_POLICY_SQL } from './rls'
import { riskMigrationTasks } from './risk-migration-readiness'

// Test-only, byte-identical approved Batch 01 contract; never part of the migration journal.
// Verify before any database or container operation. No sibling checkout is required.
const proposal = readFileSync(
  new URL('./test/approvals-security-contract.fixture.sql', import.meta.url),
  'utf8',
)
const proposalHash = createHash('sha256').update(proposal).digest('hex')
assert.equal(proposalHash, '9d7e47851e1ddf38335826fe0160099e8839d542d18505f141f36653da8c7780')
console.log('Pinned Approvals security fixture SHA256:', proposalHash)

const container = 'uvanoo-migration-safety-20261012'
const [metadata] = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))
assert.equal(metadata.Config.Labels['uvanoo.task'], 'migration-safety')
assert.equal(metadata.HostConfig.NetworkMode, 'none')
assert.ok(metadata.HostConfig.Tmpfs['/var/lib/postgresql/data'])
assert.equal(metadata.Config.Image, 'postgres:16-alpine')
const bridge = createServer((socket) => {
  const child = spawn('docker', ['exec', '-i', container, 'nc', '127.0.0.1', '5432'])
  socket.pipe(child.stdin)
  child.stdout.pipe(socket)
  child.on('error', (error) => socket.destroy(error))
  child.on('exit', () => socket.destroy())
  socket.on('error', () => child.kill())
  socket.on('close', () => child.kill())
  child.stdin.on('error', () => socket.destroy())
})
await new Promise<void>((resolve) => bridge.listen(0, '127.0.0.1', resolve))
const address = bridge.address()
assert.ok(address && typeof address !== 'string')
const port = address.port
const clients: ReturnType<typeof postgres>[] = []
const reservations: postgres.ReservedSql[] = []
function connect(database: string, username = 'postgres') {
  const client = postgres({
    host: '127.0.0.1',
    port,
    database,
    username,
    max: 1,
    onnotice: () => {},
  })
  clients.push(client)
  return client
}
const roles = ['beaconhs_owner', 'beaconhs_app', 'beaconhs_super', 'beaconhs_backup'] as const
const folder = fileURLToPath(new URL('../drizzle', import.meta.url))
const sequence = loadMigrationBodies(folder, readMigrationFiles(folder))
const baseline = sequence.slice(0, 58)
const risk = preparedRiskProposals.map(([tag, createdAt, hash]) => ({
  tag,
  createdAt,
  hash,
  body: readFileSync(`${folder}/${tag}.sql`, 'utf8'),
}))
assert.equal(sequence.length, 61)
assert.deepEqual(sequence.slice(58), risk)
function fixture(tag: string, createdAt: number, body: string) {
  return { tag, createdAt, body, hash: createHash('sha256').update(body).digest('hex') }
}
try {
  const admin = connect('safety_admin')
  console.log('PostgreSQL:', (await admin`SELECT version()`)[0]?.version)
  await admin.unsafe(
    `CREATE ROLE beaconhs_owner NOLOGIN; CREATE ROLE beaconhs_app LOGIN NOINHERIT;
    CREATE ROLE beaconhs_super LOGIN NOINHERIT BYPASSRLS;
    CREATE ROLE beaconhs_backup LOGIN NOINHERIT BYPASSRLS;
    ALTER ROLE beaconhs_backup SET default_transaction_read_only='on';
    CREATE ROLE beaconhs_migrator LOGIN NOINHERIT; GRANT beaconhs_owner TO beaconhs_migrator;`,
  )
  for (const name of [
    'safety_fresh',
    'safety_forward',
    'safety_recovery',
    'safety_cli',
    'safety_cli_forward',
  ])
    await admin.unsafe(`CREATE DATABASE ${name} OWNER beaconhs_owner`)
  for (const name of ['safety_fresh', 'safety_forward']) {
    const client = await connect(name).reserve()
    reservations.push(client)
    await client`SET ROLE beaconhs_owner`
    await client`SELECT pg_advisory_lock(hashtext('beaconhs:schema-migration'))`
    const db = pinnedMigrationDatabase(client)
    await prepareMigrationPrivileges(db, ...roles)
    if (name === 'safety_forward') {
      assert.equal((await executePendingMigrations(db, baseline)).length, 58)
      await grantUnmanagedObjects(db, ...roles)
      await client.unsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE beaconhs_owner IN SCHEMA public
        GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO beaconhs_app,beaconhs_super;
        ALTER DEFAULT PRIVILEGES FOR ROLE beaconhs_owner IN SCHEMA public
        GRANT SELECT ON TABLES TO beaconhs_backup;`)
      await prepareMigrationPrivileges(db, ...roles)
      await client`CREATE TABLE default_acl_probe(id int)`
      assert.equal(
        (
          await client`SELECT has_table_privilege('beaconhs_app','default_acl_probe','SELECT,INSERT,UPDATE,DELETE') AS exposed`
        )[0]?.exposed,
        false,
      )
      console.log('PASS old broad default grants removed before new objects are created')
    }
    assert.equal(
      (await executePendingMigrations(db, sequence)).length,
      name === 'safety_fresh' ? 61 : 3,
    )
    const before =
      await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`
    assert.deepEqual(
      before.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) })),
      sequence.map(({ hash, createdAt }) => ({ hash, createdAt })),
    )
    assert.deepEqual(await executePendingMigrations(db, sequence), [])
    assert.deepEqual(
      await client`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
      before,
    )
    await grantUnmanagedObjects(db, ...roles)
    await grantUnmanagedObjects(db, ...roles)
    for (const role of ['beaconhs_app', 'beaconhs_super']) {
      const [privileges] =
        await client`SELECT has_table_privilege(${role},'risk_assessment_versions','SELECT,INSERT') AS allowed,
        has_table_privilege(${role},'risk_assessment_versions','UPDATE,DELETE,TRUNCATE') AS forbidden`
      assert.equal(privileges?.allowed, true)
      assert.equal(privileges?.forbidden, false)
    }
    console.log(`PASS ${name}: replay, exact 61-entry ledger, no-op, Risk privilege preservation`)
    if (name === 'safety_fresh') {
      for (const table of riskMigrationTasks({ families: true, versions: true }).tables)
        await client.unsafe(RLS_POLICY_SQL(table))
      const securityPredicate = readFileSync(
        new URL('./verify-prepared-risk.ts', import.meta.url),
        'utf8',
      ).match(/const \[security\] = await query\(`([\s\S]*?)`\)/)?.[1]
      assert.ok(
        securityPredicate,
        'Existing prepared-Risk security predicate must be found unchanged',
      )
      assert.equal((await client.unsafe(securityPredicate))[0]?.ready, true)
      await client`BEGIN`
      try {
        await client`GRANT UPDATE ON risk_assessment_versions TO beaconhs_app`
        assert.equal((await client.unsafe(securityPredicate))[0]?.ready, false)
      } finally {
        await client`ROLLBACK`
      }
      assert.equal((await client.unsafe(securityPredicate))[0]?.ready, true)
      console.log(
        'PASS existing prepared-Risk security predicate; injected application ACL drift detected and rolled back',
      )
      await client.unsafe(
        'GRANT USAGE ON SCHEMA security TO beaconhs_app; GRANT EXECUTE ON FUNCTION security.person_allows_scope(uuid,uuid) TO beaconhs_app;',
      )
      await client`RESET ROLE`
      await client.unsafe(
        readFileSync(
          new URL('./people-property-provenance.integration.sql', import.meta.url),
          'utf8',
        ),
      )
      console.log('PASS unchanged People 0057 provenance/property-isolation SQL regression')
      await client`SET ROLE beaconhs_owner`
      await db.transaction(async () => {
        await client.unsafe(proposal)
      })
      await grantUnmanagedObjects(db, ...roles)
      for (const role of ['beaconhs_app', 'beaconhs_super']) {
        for (const table of [
          'approval_workflows',
          'approval_requests',
          'approval_stages',
          'approval_decisions',
          'approval_events',
        ]) {
          assert.equal(
            (
              await client`SELECT has_table_privilege(${role},${table},'UPDATE,DELETE,TRUNCATE') AS forbidden`
            )[0]?.forbidden,
            false,
          )
        }
        assert.equal(
          (
            await client`SELECT has_column_privilege(${role},'approval_requests','status','UPDATE') AS allowed`
          )[0]?.allowed,
          true,
        )
        assert.equal(
          (
            await client`SELECT has_column_privilege(${role},'approval_requests','requester_id','UPDATE') AS allowed`
          )[0]?.allowed,
          false,
        )
      }
      console.log('PASS actual unnumbered Approvals proposal table/column privilege preservation')
      await client.unsafe(`CREATE TABLE future_backup_fixture(id int, evidence text);
        REVOKE ALL ON future_backup_fixture FROM beaconhs_app,beaconhs_super;
        INSERT INTO future_backup_fixture VALUES (1,'Synthetic backup evidence');
        GRANT USAGE ON SCHEMA drizzle TO beaconhs_backup;
        GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO beaconhs_backup;
        GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO beaconhs_backup;`)
      await grantUnmanagedObjects(db, ...roles)
      const backup = connect(name, 'beaconhs_backup')
      assert.equal(
        (await backup`SHOW default_transaction_read_only`)[0]?.default_transaction_read_only,
        'on',
      )
      await backup`SET default_transaction_read_only=off`
      for (const table of [
        'risk_assessment_versions',
        'risk_template_families',
        'future_backup_fixture',
        'approval_requests',
      ]) {
        await backup.unsafe(`SELECT * FROM ${table}`)
        for (const statement of [
          `UPDATE ${table} SET id=id`,
          `DELETE FROM ${table}`,
          `TRUNCATE ${table}`,
        ])
          await assert.rejects(
            backup.unsafe(statement),
            (error: unknown) => (error as { code?: string }).code === '42501',
          )
      }
      await assert.rejects(
        backup`UPDATE future_backup_fixture SET evidence='forbidden'`,
        (error: unknown) => (error as { code?: string }).code === '42501',
      )
      await assert.rejects(
        backup`INSERT INTO future_backup_fixture VALUES (2,'forbidden')`,
        (error: unknown) => (error as { code?: string }).code === '42501',
      )
      await assert.rejects(
        backup`SET ROLE beaconhs_owner`,
        (error: unknown) => (error as { code?: string }).code === '42501',
      )
      await assert.rejects(
        backup`CREATE ROLE forbidden_escalation`,
        (error: unknown) => (error as { code?: string }).code === '42501',
      )
      assert.equal((await backup`SELECT count(*)::int AS n FROM future_backup_fixture`)[0]?.n, 1)
      await client`GRANT UPDATE(evidence) ON future_backup_fixture TO beaconhs_backup`
      await assert.rejects(grantBackupReadAccess(db, roles[0], roles[3]), /ACL drift/)
      await client`REVOKE UPDATE(evidence) ON future_backup_fixture FROM beaconhs_backup`
      await admin`GRANT beaconhs_super TO beaconhs_backup`
      await assert.rejects(grantBackupReadAccess(db, roles[0], roles[3]), /canonical/)
      await admin`REVOKE beaconhs_super FROM beaconhs_backup`
      await grantBackupReadAccess(db, roles[0], roles[3])
      console.log(
        'PASS backup SELECT, denied writes with read-only disabled, no escalation; column-ACL and role-membership drift rejected',
      )
      const backupOutput = execFileSync(
        'docker',
        [
          'exec',
          '-i',
          '-e',
          'PGHOST=127.0.0.1',
          '-e',
          `PGDATABASE=${name}`,
          '-e',
          'PGUSER=beaconhs_backup',
          '-e',
          'BACKUP_ALLOW_PLAINTEXT=true',
          container,
          'sh',
          '-s',
          '--',
          '/tmp/safety-backups',
        ],
        {
          input: readFileSync(new URL('../../../scripts/cluster/backup.sh', import.meta.url)),
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024,
        },
      )
      const archive = backupOutput.match(/Backup verified: (.+)/)?.[1]
      assert.ok(archive)
      const restoreOutput = execFileSync(
        'docker',
        [
          'exec',
          '-i',
          '-e',
          'PGHOST=127.0.0.1',
          '-e',
          'PGDATABASE=safety_admin',
          '-e',
          'PGUSER=postgres',
          container,
          'sh',
          '-s',
          '--',
          archive,
        ],
        {
          input: readFileSync(
            new URL('../../../scripts/cluster/restore-verify.sh', import.meta.url),
          ),
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024,
        },
      )
      console.log(backupOutput.trim(), '\n', restoreOutput.trim())
      console.log(
        'PASS repository backup.sh and checksum-portable restore-verify.sh against disposable data',
      )
    }
    await client`SELECT pg_advisory_unlock(hashtext('beaconhs:schema-migration'))`
  }
  const client = await connect('safety_recovery').reserve()
  reservations.push(client)
  await client`SET ROLE beaconhs_owner`
  await client`SELECT pg_advisory_lock(hashtext('beaconhs:schema-migration'))`
  const db = pinnedMigrationDatabase(client)
  await prepareMigrationPrivileges(db, ...roles)
  const first = fixture('fixture_first', 1, 'CREATE TABLE committed_marker(id int);')
  const failing = fixture(
    'fixture_retry',
    2,
    `CREATE TABLE retry_marker(id int); --> statement-breakpoint
    DO $$ BEGIN IF current_setting('test.allow_retry',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'EXPECTED_FAILURE'; END IF; END $$;`,
  )
  await assert.rejects(executePendingMigrations(db, [first, failing]))
  assert.equal((await client`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0]?.n, 1)
  assert.equal((await client`SELECT to_regclass('retry_marker') AS marker`)[0]?.marker, null)
  await client`SET test.allow_retry='yes'`
  assert.deepEqual(await executePendingMigrations(db, [first, failing]), ['fixture_retry'])
  await client`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ('invalid',2)`
  await assert.rejects(executePendingMigrations(db, [first, failing]), /Duplicate/)
  await client`DELETE FROM drizzle.__drizzle_migrations WHERE hash='invalid'`
  await client`UPDATE drizzle.__drizzle_migrations SET hash='invalid' WHERE created_at=2`
  await assert.rejects(executePendingMigrations(db, [first, failing]), /inconsistent/)
  await client`UPDATE drizzle.__drizzle_migrations SET hash=${failing.hash} WHERE created_at=2`
  const ledgerFailure = fixture(
    'fixture_ledger_failure',
    3,
    'CREATE TABLE ledger_failure_marker(id int);',
  )
  await client.unsafe(`CREATE FUNCTION reject_test_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.created_at=3 THEN RAISE EXCEPTION 'EXPECTED_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_test_ledger BEFORE INSERT ON drizzle.__drizzle_migrations
    FOR EACH ROW EXECUTE FUNCTION reject_test_ledger();`)
  await assert.rejects(
    executePendingMigrations(db, [first, failing, ledgerFailure]),
    /EXPECTED_LEDGER_FAILURE/,
  )
  assert.equal(
    (await client`SELECT to_regclass('ledger_failure_marker') AS marker`)[0]?.marker,
    null,
  )
  assert.equal((await client`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0]?.n, 2)
  await client`DROP TRIGGER reject_test_ledger ON drizzle.__drizzle_migrations`
  assert.deepEqual(await executePendingMigrations(db, [first, failing, ledgerFailure]), [
    'fixture_ledger_failure',
  ])
  console.log('PASS ledger insertion failure rolls back SQL; unchanged retry commits both')
  console.log(
    'PASS failure rollback, previous commit survives, unchanged-SQL retry, duplicate/hash ledger rejection',
  )
  await client.unsafe(`CREATE TABLE denied_fixture(id int); REVOKE ALL ON denied_fixture FROM beaconhs_app;
    CREATE TABLE column_fixture(id int, decision text); GRANT SELECT,INSERT ON column_fixture TO beaconhs_app;
    GRANT UPDATE(decision) ON column_fixture TO beaconhs_app;`)
  await grantUnmanagedObjects(db, ...roles)
  const [acl] =
    await client`SELECT has_table_privilege('beaconhs_app','denied_fixture','SELECT,INSERT,UPDATE,DELETE') AS denied,
    has_table_privilege('beaconhs_app','column_fixture','UPDATE') AS broad,
    has_column_privilege('beaconhs_app','column_fixture','decision','UPDATE') AS narrow,
    has_column_privilege('beaconhs_app','column_fixture','id','UPDATE') AS immutable`
  assert.deepEqual({ ...acl }, { denied: false, broad: false, narrow: true, immutable: false })
  console.log('PASS explicit zero-access and Approvals-style column privilege preservation')
  const competitor = connect('safety_recovery')
  assert.equal(
    (
      await competitor`SELECT pg_try_advisory_lock(hashtext('beaconhs:schema-migration')) AS acquired`
    )[0]?.acquired,
    false,
  )
  await client`SELECT pg_advisory_unlock(hashtext('beaconhs:schema-migration'))`
  assert.equal(
    (
      await competitor`SELECT pg_try_advisory_lock(hashtext('beaconhs:schema-migration')) AS acquired`
    )[0]?.acquired,
    true,
  )
  await competitor`SET ROLE beaconhs_owner`
  assert.deepEqual(
    await executePendingMigrations(drizzle(competitor), [first, failing, ledgerFailure]),
    [],
  )
  await competitor`SELECT pg_advisory_unlock(hashtext('beaconhs:schema-migration'))`
  console.log('PASS concurrent connection exclusion and successor no-op')
  const forward = await connect('safety_cli_forward').reserve()
  reservations.push(forward)
  await forward`SET ROLE beaconhs_owner`
  await forward`SELECT pg_advisory_lock(hashtext('beaconhs:schema-migration'))`
  const forwardDb = pinnedMigrationDatabase(forward)
  await prepareMigrationPrivileges(forwardDb, ...roles)
  assert.equal((await executePendingMigrations(forwardDb, baseline)).length, 58)
  await forward`SELECT pg_advisory_unlock(hashtext('beaconhs:schema-migration'))`
  for (const phase of ['fresh', 'no-op', 'forward-58-to-61', 'existing-61-no-op']) {
    const database =
      phase === 'existing-61-no-op'
        ? 'safety_fresh'
        : phase === 'forward-58-to-61'
          ? 'safety_cli_forward'
          : 'safety_cli'
    const cliUrl = (role: string) => `postgres://${role}@127.0.0.1:${port}/${database}`
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.resolve('tsx/cli')),
          fileURLToPath(new URL('./migrate.ts', import.meta.url)),
        ],
        {
          env: {
            ...process.env,
            MIGRATION_DATABASE_URL: cliUrl('beaconhs_migrator'),
            DATABASE_URL: cliUrl('beaconhs_app'),
            SUPERADMIN_DATABASE_URL: cliUrl('beaconhs_super'),
            DATABASE_OWNER_ROLE: 'beaconhs_owner',
            DATABASE_BACKUP_ROLE: 'beaconhs_backup',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      child.stdout.on('data', (chunk) => process.stdout.write(chunk))
      child.stderr.on('data', (chunk) => {
        process.stderr.write(chunk)
      })
      child.on('error', reject)
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Complete runner ${phase} failed: ${code}`)),
      )
    })
    console.log(`PASS complete migrate.ts CLI ${phase} using canonical 61-entry journal`)
    const verified = await connect(
      database,
    )`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`
    assert.deepEqual(
      verified.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) })),
      sequence.map(({ hash, createdAt }) => ({ hash, createdAt })),
    )
  }
} finally {
  for (const connection of reservations) connection.release()
  await Promise.all(clients.map((client) => client.end({ timeout: 2 })))
  await new Promise<void>((resolve) => bridge.close(() => resolve()))
}
