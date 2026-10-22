import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonical, LOGICAL_SCHEMA_PROFILE } from './dev-logical-catalog'
import {
  DEV_TARGET,
  TEMPORARY_CLASS,
  WEB_CHECKS,
  admissionChecks,
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
function fixture(phase: AdmissionPhase = 'migration', maintenance = false) {
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
    schemas: { 58: hash, 63: hash, 66: hash, 67: hash },
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
  if (maintenance)
    a.maintenanceHold = {
      technicalExclusion: false,
      privilegedOperatorRiskAccepted: true,
      startsAt: e.backup.createdAt,
      expiresAt: a.expiresAt,
      receiptSha256: hash,
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
    attestation: 'ed25519',
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
      admissionChecks(phase, a).map((k) => [k, { passed: true, evidenceSha256: hash }]),
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
  it('accepts documented operational evidence only for the exact DEV maintenance hold', () => {
    const f = fixture('migration', true)
    delete f.a.safetyPublicKeyDer
    f.a.operationalEvidence = {
      mode: 'documented-operational',
      independentAttestation: false,
    }
    f.pin = digest(JSON.stringify(f.a))
    f.e.admission!.approvalSha256 = f.pin
    f.safety.payload.approvalSha256 = f.pin
    f.safety.payload.attestation = 'documented-operational'
    f.safety.signature = ''
    expect(() =>
      validateTemporaryAdmission(f.e, f.a, f.r, f.safety, f.pin, 'migration', env, now),
    ).not.toThrow()
  })
  it.each(['signature', 'target', 'production', 'hold', 'claim'])(
    'rejects documented operational evidence with %s safety defect',
    (kind) => {
      const f = fixture('migration', true)
      delete f.a.safetyPublicKeyDer
      f.a.operationalEvidence = {
        mode: 'documented-operational',
        independentAttestation: false,
      }
      f.pin = digest(JSON.stringify(f.a))
      f.e.admission!.approvalSha256 = f.pin
      f.safety.payload.approvalSha256 = f.pin
      f.safety.payload.attestation = 'documented-operational'
      f.safety.signature = ''
      if (kind === 'signature') f.safety.signature = 'not-independent'
      if (kind === 'target')
        f.a.target = { ...DEV_TARGET, host: 'legacy.uvanoo.com' } as unknown as typeof DEV_TARGET
      if (kind === 'hold') delete f.a.maintenanceHold
      if (kind === 'claim') f.a.operationalEvidence.independentAttestation = true as false
      expect(() =>
        validateTemporaryAdmission(
          f.e,
          f.a,
          f.r,
          f.safety,
          f.pin,
          'migration',
          kind === 'production' ? { ...env, DEV_RELEASE_ENVIRONMENT: 'production' } : env,
          now,
        ),
      ).toThrow()
    },
  )
  it('does not waive a web safety check for documented operational evidence', () => {
    const f = fixture('web', true)
    delete f.a.safetyPublicKeyDer
    f.a.operationalEvidence = {
      mode: 'documented-operational',
      independentAttestation: false,
    }
    f.pin = digest(JSON.stringify(f.a))
    f.e.admission!.approvalSha256 = f.pin
    f.safety.payload.approvalSha256 = f.pin
    f.safety.payload.attestation = 'documented-operational'
    f.safety.signature = ''
    delete f.safety.payload.checks.crossStoreConsistency
    expect(() =>
      validateTemporaryAdmission(f.e, f.a, f.r, f.safety, f.pin, 'web', env, now),
    ).toThrow()
  })
  it('pins maintenance acceptance to the existing private owner approval bytes', () => {
    const f = fixture('migration', true),
      directory = realpathSync(mkdtempSync(join(tmpdir(), 'dev-hold-pin-')))
    try {
      const put = (name: string, value: unknown) =>
        writeFileSync(join(directory, name), JSON.stringify(value), { mode: 0o600 })
      put('owner-approval.json', f.a)
      put('private-restore.json', f.r)
      put('safety.json', f.safety)
      const context = { ...env, DEV_TEMPORARY_APPROVAL_SHA256: f.pin }
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', context, now)).not.toThrow()
      put('owner-approval.json', {
        ...f.a,
        maintenanceHold: { ...f.a.maintenanceHold, receiptSha256: '0'.repeat(64) },
      })
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', context, now)).toThrow()
      put('owner-approval.json', f.a)
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', env, now)).toThrow()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it.each(['migration', 'web'] as const)(
    'accepts an explicit owner maintenance hold for %s only',
    (phase) => {
      const f = fixture(phase, true)
      expect(() => f.check()).not.toThrow()
      expect(f.safety.payload.checks.writerExclusion).toBeUndefined()
      expect(f.safety.payload.checks.ownerMaintenanceHold?.passed).toBe(true)
    },
  )
  it.each([
    'risk',
    'claim',
    'expired',
    'future',
    'long',
    'late-start',
    'hash',
    'extra',
    'missing',
    'wrong-target',
    'production',
    'unsigned',
    'overrun',
  ])('rejects maintenance hold %s', (kind) => {
    const f = fixture('migration', true),
      hold = f.a.maintenanceHold!
    if (kind === 'risk') hold.privilegedOperatorRiskAccepted = false as true
    if (kind === 'claim') hold.technicalExclusion = true as false
    if (kind === 'expired') hold.expiresAt = new Date(now).toISOString()
    if (kind === 'future') hold.startsAt = new Date(now + 1).toISOString()
    if (kind === 'long')
      hold.expiresAt = new Date(Date.parse(hold.startsAt) + 7200_001).toISOString()
    if (kind === 'late-start') hold.startsAt = new Date(now - 1).toISOString()
    if (kind === 'hash') hold.receiptSha256 = ''
    if (kind === 'extra') Object.assign(hold, { operators: [] })
    if (kind === 'missing') delete f.a.maintenanceHold
    if (kind === 'wrong-target')
      f.a.target = { ...DEV_TARGET, composeId: 'legacy' } as unknown as typeof DEV_TARGET
    if (kind === 'unsigned') f.safety.signature = ''
    if (kind === 'overrun') hold.expiresAt = new Date(now + 1000).toISOString()
    expect(() =>
      f.check(kind === 'production' ? { ...env, DEV_RELEASE_ENVIRONMENT: 'production' } : env),
    ).toThrow()
  })
  it.each(WEB_CHECKS.filter((key) => key !== 'writerExclusion'))(
    'maintenance does not waive %s',
    (key) => {
      const f = fixture('web', true)
      delete f.safety.payload.checks[key]
      f.safety.signature = sign(
        null,
        Buffer.from(canonical(f.safety.payload)),
        f.keys.privateKey,
      ).toString('base64')
      expect(() => f.check()).toThrow()
    },
  )
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
      put('monitor-stopped.json', { status: 'STOPPED' })
      expect(() => checkTemporaryFiles(f.e, directory, 'migration', e, now)).toThrow()
      rmSync(join(directory, 'monitor-stopped.json'))
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
