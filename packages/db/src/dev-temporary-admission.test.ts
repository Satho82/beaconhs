import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonical, LOGICAL_SCHEMA_PROFILE } from './dev-logical-catalog'
import {
  DEV_TARGET,
  TEMPORARY_CLASS,
  MIGRATION_CHECKS,
  WEB_CHECKS,
  checkTemporaryFiles,
  validateTemporaryAdmission,
  requireTemporaryDatabaseTarget,
  type TemporaryApproval,
  type PrivateRestoreReceipt,
  type SafetyReceipt,
  type AdmissionPhase,
} from './dev-temporary-admission'
import {
  digest,
  validateEvidence,
  sourceMigrations,
  devMigrationFolder,
  type ReleaseEvidence,
} from './dev-migration-gate'
const now = Date.parse('2026-10-14T01:00:00Z'),
  hash = 'a'.repeat(64)
const files = sourceMigrations(devMigrationFolder)
const env = {
  FEATURE_CANDIDATE_VERIFIED: 'true',
  DEV_RELEASE_ENVIRONMENT: 'dev',
  GITHUB_REPOSITORY: DEV_TARGET.repository,
  DOKPLOY_COMPOSE_ID: DEV_TARGET.composeId,
  EXPECTED_DOKPLOY_STACK: DEV_TARGET.stack,
  EXPECTED_APP_HOST: DEV_TARGET.host,
  EXPECTED_MIGRATION_HOST: DEV_TARGET.databaseHost,
  MIGRATION_DOCKER_NETWORK: DEV_TARGET.network,
}
function fixture(phase: AdmissionPhase = 'migration') {
  const keys = generateKeyPairSync('ed25519')
  const e: ReleaseEvidence = {
    version: 2,
    schemaProfile: LOGICAL_SCHEMA_PROFILE,
    sourceSha: 'b'.repeat(40),
    sourceTree: 'c'.repeat(40),
    imageDigest: 'sha256:' + hash,
    database: 'beaconhs',
    databaseOid: 123,
    postgresVersion: '160015',
    migrations: files,
    schemas: { 58: hash, 63: hash },
    backup: {
      file: 'backup.dump.age',
      sha256: hash,
      createdAt: '2026-10-14T00:50:00Z',
      restoredAt: '2026-10-14T00:55:00Z',
      restoreRun: 'private:restore_fixture',
      ledgerHash: hash,
      dataHash: hash,
      schemaHash: hash,
      restoredLedgerHash: hash,
      restoredDataHash: hash,
      restoredSchemaHash: hash,
      rollbackImageDigest: 'sha256:' + hash,
    },
  }
  const r: PrivateRestoreReceipt = {
    version: 1,
    runId: 'restore_fixture',
    target: DEV_TARGET,
    databaseOid: e.databaseOid,
    sourceSha: e.sourceSha,
    sourceTree: e.sourceTree,
    imageDigest: e.imageDigest,
    backupSha256: hash,
    sourceHostSha256: '1'.repeat(64),
    restoreHostSha256: '2'.repeat(64),
    recipientSha256: '3'.repeat(64),
    capturedAt: e.backup.createdAt,
    restoredAt: e.backup.restoredAt,
    schemaProfile: LOGICAL_SCHEMA_PROFILE,
    sourceRawCatalogSha256: '4'.repeat(64),
    restoredRawCatalogSha256: '5'.repeat(64),
    sourceSchemaHash: hash,
    restoredSchemaHash: hash,
    sourceLedgerHash: hash,
    restoredLedgerHash: hash,
    sourceDataHash: hash,
    restoredDataHash: hash,
    catalogSections: 19,
    postgresVersion: '160015',
    pristineRetained: true,
  }
  const a: TemporaryApproval = {
    version: 1,
    class: TEMPORARY_CLASS,
    immutable: false,
    productionEligible: false,
    owner: 'fixture owner',
    auditId: 'approval_fixture',
    issuedAt: '2026-10-14T00:56:00Z',
    expiresAt: '2026-10-14T02:00:00Z',
    target: DEV_TARGET,
    databaseOid: e.databaseOid,
    sourceSha: e.sourceSha,
    sourceTree: e.sourceTree,
    imageDigest: e.imageDigest,
    backupSha256: hash,
    restoreReceiptSha256: digest(JSON.stringify(r)),
    sourceHostSha256: r.sourceHostSha256,
    restoreHostSha256: r.restoreHostSha256,
    recipientSha256: r.recipientSha256,
    monitorId: 'fixture_monitor',
    safetyPublicKeyDer: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    capabilities: ['migration', 'web'],
    acceptedRisks: ['non-immutable', 'owner-device-loss', 'post-snapshot-write-loss'],
  }
  const pin = digest(JSON.stringify(a))
  e.admission = {
    class: TEMPORARY_CLASS,
    immutable: false,
    productionEligible: false,
    approvalFile: 'owner-approval.json',
    approvalSha256: pin,
    restoreReceiptFile: 'private-restore.json',
    restoreReceiptSha256: a.restoreReceiptSha256,
  }
  const p: SafetyReceipt = {
    version: 1,
    target: DEV_TARGET,
    approvalSha256: pin,
    sourceSha: e.sourceSha,
    imageDigest: e.imageDigest,
    backupSha256: hash,
    monitorId: a.monitorId,
    phase,
    observedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 5000).toISOString(),
    checks: Object.fromEntries(
      (phase === 'web' ? WEB_CHECKS : MIGRATION_CHECKS).map((k) => [
        k,
        { passed: true, evidenceSha256: hash },
      ]),
    ),
  }
  const safety = {
    payload: p,
    signature: sign(null, Buffer.from(canonical(p)), keys.privateKey).toString('base64'),
  }
  const check = (environment: NodeJS.ProcessEnv = env, time = now) => {
    validateEvidence(e, files, e, time)
    validateTemporaryAdmission(e, a, r, safety, pin, phase, environment, time)
  }
  return { e, a, r, safety, pin, check, keys }
}
describe('exact DEV temporary admission', () => {
  it('binds the actual connection rather than trusting environment target labels', () => {
    const url = 'postgresql://beaconhs_backup:synthetic@uvanoo-dev-postgres:5432/beaconhs'
    expect(() => requireTemporaryDatabaseTarget(url, 'beaconhs_backup')).not.toThrow()
    for (const bad of [
      url.replace('uvanoo-dev-postgres', 'beaconhs-postgres'),
      url.replace('5432', '5433'),
      url + '?hostaddr=127.0.0.1',
      url.replace('/beaconhs', '/other'),
      url + '#fragment',
    ])
      expect(() => requireTemporaryDatabaseTarget(bad, 'beaconhs_backup')).toThrow(
        'DEV temporary database target rejected',
      )
    expect(() => requireTemporaryDatabaseTarget(url, 'beaconhs_migrator')).toThrow()
  })
  it.each(['migration', 'web'] as const)(
    'accepts independently pinned owner/restore and signed %s evidence',
    (phase) => expect(() => fixture(phase).check()).not.toThrow(),
  )
  it.each(Object.keys(env))('rejects wrong/production context %s', (key) =>
    expect(() => fixture().check({ ...env, [key]: 'production' })).toThrow(),
  )
  it.each([
    'expiry',
    'too-long',
    'future-approval',
    'stale-backup',
    'same-host',
    'recipient',
    'source',
    'restore-data',
    'restore-raw',
    'unsigned',
    'stale-safety',
    'wrong-phase',
    'monitor',
    'target',
    'capability',
    'mislabel',
  ])('rejects %s', (kind) => {
    const f = fixture()
    if (kind === 'expiry') f.a.expiresAt = new Date(now).toISOString()
    if (kind === 'too-long') f.a.expiresAt = '2026-10-18T00:00:00Z'
    if (kind === 'future-approval') f.a.issuedAt = new Date(now + 1).toISOString()
    if (kind === 'stale-backup') f.e.backup.createdAt = '2026-10-13T23:59:59Z'
    if (kind === 'same-host') f.a.restoreHostSha256 = f.a.sourceHostSha256
    if (kind === 'recipient') f.r.recipientSha256 = '0'.repeat(64)
    if (kind === 'source') f.a.sourceSha = '0'.repeat(40)
    if (kind === 'restore-data') f.r.restoredDataHash = '0'.repeat(64)
    if (kind === 'restore-raw') f.r.restoredRawCatalogSha256 = ''
    if (kind === 'unsigned') f.safety.signature = ''
    if (kind === 'stale-safety') f.safety.payload.observedAt = new Date(now - 10001).toISOString()
    if (kind === 'wrong-phase') f.safety.payload.phase = 'web'
    if (kind === 'monitor') f.safety.payload.monitorId = 'other-monitor'
    if (kind === 'target')
      f.a.target = { ...DEV_TARGET, host: 'portal.uvanoo.com' } as unknown as typeof DEV_TARGET
    if (kind === 'capability') f.a.capabilities = ['web']
    if (kind === 'mislabel') f.a.immutable = true as false
    if (kind !== 'unsigned')
      f.safety.signature = sign(
        null,
        Buffer.from(canonical(f.safety.payload)),
        f.keys.privateKey,
      ).toString('base64')
    expect(() => f.check()).toThrow()
  })
  it.each(WEB_CHECKS)('cannot admit writable web without %s even if signed', (key) => {
    const f = fixture('web')
    delete f.safety.payload.checks[key]
    f.safety.signature = sign(
      null,
      Buffer.from(canonical(f.safety.payload)),
      f.keys.privateKey,
    ).toString('base64')
    expect(() => f.check()).toThrow()
  })
  it('expires automatically without changing/deleting any evidence', () => {
    const f = fixture(),
      before = canonical(f.e)
    expect(() => f.check(env, now + 6000)).toThrow()
    expect(canonical(f.e)).toBe(before)
  })
  it('fresh signatures and unexpired owner approval cannot refresh an old capture', () => {
    const f = fixture(),
      later = now + 3600_000
    f.a.expiresAt = '2026-10-14T03:00:00Z'
    f.safety.payload.observedAt = new Date(later - 1000).toISOString()
    f.safety.payload.expiresAt = new Date(later + 5000).toISOString()
    f.safety.signature = sign(
      null,
      Buffer.from(canonical(f.safety.payload)),
      f.keys.privateKey,
    ).toString('base64')
    expect(() => f.check(env, later)).toThrow()
  })
  it('rejects a fresh safety envelope signed by an unapproved monitor', () => {
    const f = fixture(),
      other = generateKeyPairSync('ed25519')
    f.safety.signature = sign(
      null,
      Buffer.from(canonical(f.safety.payload)),
      other.privateKey,
    ).toString('base64')
    expect(() => f.check()).toThrow()
  })
  it('does not permit version1 evidence to impersonate the temporary class', () => {
    const f = fixture()
    f.e.version = 1
    f.e.backup.restoreRun = 'https://github.com/Satho82/beaconhs/actions/runs/123'
    expect(() => f.check()).toThrow()
  })
  it('verifies bytes and rejects symlink, writable approval, missing owner pin and tampered receipt', () => {
    const f = fixture(),
      directory = realpathSync(mkdtempSync(join(tmpdir(), 'dev-admission-')))
    try {
      const put = (name: string, value: unknown) =>
        writeFileSync(join(directory, name), JSON.stringify(value), { mode: 0o600 })
      put('owner-approval.json', f.a)
      put('private-restore.json', f.r)
      put('safety.json', f.safety)
      const e = { ...env, DEV_TEMPORARY_APPROVAL_SHA256: f.pin }
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', e, now)).not.toThrow()
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', env, now)).toThrow()
      put('private-restore.json', { ...f.r, runId: 'tampered' })
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', e, now)).toThrow()
      put('private-restore.json', f.r)
      chmodSync(join(directory, 'owner-approval.json'), 0o666)
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', e, now)).toThrow()
      chmodSync(join(directory, 'owner-approval.json'), 0o600)
      rmSync(join(directory, 'private-restore.json'))
      symlinkSync(join(directory, 'owner-approval.json'), join(directory, 'private-restore.json'))
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', e, now)).toThrow()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
