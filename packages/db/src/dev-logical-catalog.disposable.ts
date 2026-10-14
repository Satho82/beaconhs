/** Synthetic PG16.15 only. No host mounts, networks, ports, live URLs or real data. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { schemaFingerprint, type Query } from './dev-migration-gate'
import { LOGICAL_SCHEMA_PROFILE } from './dev-logical-catalog'

if (process.env.DEV_GATE_SYNTHETIC_DOCKER !== 'true')
  throw new Error('Explicit synthetic Docker context required')
const context = 'desktop-linux'
const image = 'postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d'
const name = 'uvanoo-admission-catalog-' + randomUUID().replaceAll('-', '').slice(0, 12)
const docker = (args: string[]) =>
  execFileSync('docker', ['--context', context, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  }).trim()
let id = ''
try {
  docker(['image', 'inspect', image]) // --pull=never: do not initiate a download.
  id = docker([
    'run',
    '--pull=never',
    '-d',
    '--name',
    name,
    '--network',
    'none',
    '--memory',
    '512m',
    '--cpus',
    '1',
    '--pids-limit',
    '128',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=32m',
    '--tmpfs',
    '/var/run/postgresql:rw,nosuid,nodev,size=16m',
    '--tmpfs',
    '/var/lib/postgresql/data:rw,nosuid,nodev,size=256m',
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    image,
  ])
  assert.match(id, /^[a-f0-9]{64}$/)
  const metadata = JSON.parse(docker(['inspect', id]))[0]
  assert.equal(metadata.HostConfig.NetworkMode, 'none')
  assert.equal(Object.keys(metadata.HostConfig.PortBindings ?? {}).length, 0)
  assert.equal(metadata.HostConfig.Memory, 512 * 1024 * 1024)
  assert.equal(metadata.HostConfig.NanoCpus, 1e9)
  assert.equal(metadata.Mounts.filter((x: { Type: string }) => x.Type !== 'tmpfs').length, 0)
  let ready = false
  for (let i = 0; i < 30; i++) {
    try {
      docker(['exec', id, 'pg_isready', '-U', 'postgres'])
      ready = true
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  assert.ok(ready, 'Synthetic PostgreSQL unavailable')
  const sql = (db: string, statement: string) =>
    docker([
      'exec',
      id,
      'psql',
      '-X',
      '-w',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      db,
      '-c',
      statement,
    ])
  assert.equal(sql('postgres', "SELECT current_setting('server_version_num')"), '160015')
  sql('postgres', 'CREATE ROLE beaconhs_owner NOLOGIN NOBYPASSRLS')
  sql('postgres', 'CREATE DATABASE catalog_source')
  sql('postgres', 'CREATE DATABASE catalog_restored')
  sql(
    'catalog_source',
    "CREATE TABLE sample(id integer, obsolete text, value text NOT NULL, CONSTRAINT unique_id UNIQUE(id)); ALTER TABLE sample DROP COLUMN obsolete; CREATE TYPE state AS ENUM ('first','third')",
  )
  sql('catalog_source', "ALTER TYPE state ADD VALUE 'second' BEFORE 'third'")
  sql(
    'catalog_restored',
    "CREATE TABLE sample(id integer, value text NOT NULL, CONSTRAINT unique_id UNIQUE(id)); CREATE TYPE state AS ENUM ('first','second','third')",
  )
  const query =
    (db: string): Query =>
    async (statement) =>
      JSON.parse(
        sql(db, `SELECT coalesce(json_agg(row_to_json(x)), '[]'::json) FROM (${statement}) x`),
      )
  assert.notEqual(
    await schemaFingerprint(query('catalog_source')),
    await schemaFingerprint(query('catalog_restored')),
  )
  const logical = await schemaFingerprint(query('catalog_source'), LOGICAL_SCHEMA_PROFILE)
  assert.equal(logical, await schemaFingerprint(query('catalog_restored'), LOGICAL_SCHEMA_PROFILE))
  console.log(
    'PASS PostgreSQL16.15 physical column/enum differences retain logical equivalence across all19 sections',
  )
  const drifts = [
    'ALTER TABLE sample ALTER COLUMN value DROP NOT NULL',
    'GRANT SELECT ON sample TO PUBLIC',
    'ALTER TABLE sample OWNER TO beaconhs_owner',
    'ALTER TABLE sample ENABLE ROW LEVEL SECURITY; ALTER TABLE sample FORCE ROW LEVEL SECURITY; CREATE POLICY changed ON sample USING(true)',
    'ALTER DEFAULT PRIVILEGES FOR ROLE beaconhs_owner IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC',
    'ALTER TABLE sample ADD CONSTRAINT changed CHECK(id>0)',
    "ALTER TYPE state RENAME VALUE 'second' TO 'changed'",
  ]
  for (const [i, drift] of drifts.entries()) {
    const db = 'catalog_drift_' + i
    sql('postgres', `CREATE DATABASE ${db} TEMPLATE catalog_restored`)
    assert.equal(logical, await schemaFingerprint(query(db), LOGICAL_SCHEMA_PROFILE))
    sql(db, drift)
    assert.notEqual(
      logical,
      await schemaFingerprint(query(db), LOGICAL_SCHEMA_PROFILE),
      `Security drift ${i} escaped detection`,
    )
    console.log(`PASS isolated SQL schema/security drift ${i}`)
  }
  console.log('PASS7 isolated SQL schema/security drift cases; no live data or network')
} finally {
  if (/^[a-f0-9]{64}$/.test(id)) {
    const current = JSON.parse(docker(['inspect', id]))[0]
    assert.equal(current.Name, '/' + name)
    docker(['rm', '-f', id]) // Only this uniquely created, tmpfs-backed synthetic resource.
    console.log(
      'Removed only the newly created disposable synthetic container; no retained volumes used',
    )
  }
}
