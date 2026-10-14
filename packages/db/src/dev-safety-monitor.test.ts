import { afterEach, describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonical, LOGICAL_SCHEMA_PROFILE } from './dev-logical-catalog'
import {
  DEV_TARGET,
  admissionChecks,
  TEMPORARY_CLASS,
  type PrivateRestoreReceipt,
  type TemporaryApproval,
} from './dev-temporary-admission'
import type { ReleaseEvidence } from './dev-migration-gate'
import {
  latchMonitor,
  monitorOnce,
  prepareMonitorDirectory,
  requireMonitorService,
  runProbe,
  validateObservation,
  type MonitorPolicy,
} from './dev-safety-monitor'

const h = 'a'.repeat(64),
  now = Date.parse('2026-10-14T08:00:00Z')
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex')
const paths: string[] = []
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
})
function fixture(maintenance = false) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'dev-monitor-test-')))
  paths.push(directory)
  const key = generateKeyPairSync('ed25519')
  const evidence: ReleaseEvidence = {
    version: 2,
    schemaProfile: LOGICAL_SCHEMA_PROFILE,
    sourceSha: 'b'.repeat(40),
    sourceTree: 'c'.repeat(40),
    imageDigest: 'sha256:' + h,
    database: 'beaconhs',
    databaseOid: 123,
    postgresVersion: '160015',
    migrations: [],
    schemas: {},
    backup: {
      file: 'test.dump.age',
      sha256: h,
      createdAt: new Date(now - 600_000).toISOString(),
      restoredAt: new Date(now - 300_000).toISOString(),
      restoreRun: 'private:test_restore',
      ledgerHash: h,
      dataHash: h,
      schemaHash: h,
      restoredLedgerHash: h,
      restoredDataHash: h,
      restoredSchemaHash: h,
      rollbackImageDigest: 'sha256:' + h,
    },
  }
  const restore: PrivateRestoreReceipt = {
    version: 1,
    runId: 'test_restore',
    target: DEV_TARGET,
    databaseOid: 123,
    sourceSha: evidence.sourceSha,
    sourceTree: evidence.sourceTree,
    imageDigest: evidence.imageDigest,
    backupSha256: h,
    sourceHostSha256: '1'.repeat(64),
    restoreHostSha256: '2'.repeat(64),
    recipientSha256: '3'.repeat(64),
    capturedAt: evidence.backup.createdAt,
    restoredAt: evidence.backup.restoredAt,
    schemaProfile: LOGICAL_SCHEMA_PROFILE,
    sourceRawCatalogSha256: h,
    restoredRawCatalogSha256: h,
    sourceSchemaHash: h,
    restoredSchemaHash: h,
    sourceLedgerHash: h,
    restoredLedgerHash: h,
    sourceDataHash: h,
    restoredDataHash: h,
    catalogSections: 19,
    postgresVersion: '160015',
    pristineRetained: true,
  }
  const approval: TemporaryApproval = {
    version: 1,
    class: TEMPORARY_CLASS,
    immutable: false,
    productionEligible: false,
    owner: 'synthetic',
    auditId: 'test_approval',
    issuedAt: new Date(now - 100_000).toISOString(),
    expiresAt: new Date(now + 3600_000).toISOString(),
    target: DEV_TARGET,
    databaseOid: 123,
    sourceSha: evidence.sourceSha,
    sourceTree: evidence.sourceTree,
    imageDigest: evidence.imageDigest,
    backupSha256: h,
    restoreReceiptSha256: sha(canonical(restore)),
    sourceHostSha256: restore.sourceHostSha256,
    restoreHostSha256: restore.restoreHostSha256,
    recipientSha256: restore.recipientSha256,
    monitorId: 'test_monitor',
    safetyPublicKeyDer: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    capabilities: ['migration', 'web'],
    acceptedRisks: ['non-immutable', 'owner-device-loss', 'post-snapshot-write-loss'],
  }
  if (maintenance)
    approval.maintenanceHold = {
      technicalExclusion: false,
      privilegedOperatorRiskAccepted: true,
      startsAt: evidence.backup.createdAt,
      expiresAt: approval.expiresAt,
      receiptSha256: h,
    }
  const pin = sha(canonical(approval))
  evidence.admission = {
    class: TEMPORARY_CLASS,
    immutable: false,
    productionEligible: false,
    approvalFile: 'owner-approval.json',
    approvalSha256: pin,
    restoreReceiptFile: 'private-restore.json',
    restoreReceiptSha256: approval.restoreReceiptSha256,
  }
  const policy: MonitorPolicy = {
    version: 1,
    target: DEV_TARGET,
    sourceSha: evidence.sourceSha,
    phase: 'migration',
    monitorId: approval.monitorId,
    approvalSha256: pin,
    manifestSha256: sha(canonical(evidence)),
    probes: Object.fromEntries(
      admissionChecks('migration', approval).map((c) => [
        c,
        { executable: c, args: [], dependencies: {}, sha256: h },
      ]),
    ),
  }
  const facts: Record<string, Record<string, unknown>> = {
    ownerMaintenanceHold: {
      technicalExclusion: false,
      ownerHoldActive: true,
      workflow373396385Disabled: true,
      unapprovedDeployments: 0,
      queuedDeployments: 0,
      unexpectedSpecChanges: 0,
      unapprovedPostgresClients: 0,
      unapprovedRedisClients: 0,
      storageWriters: 0,
      holdReceiptSha256: h,
      allowedMigrationConnectionsSha256: h,
    },
    writerExclusion: {
      exclusiveHoldActive: true,
      authenticatedDeployersExcluded: true,
      directDockerWritersExcluded: true,
      unapprovedPostgresClients: 0,
      unapprovedRedisClients: 0,
      storageWriters: 0,
      holdReceiptSha256: h,
      allowedMigrationConnectionsSha256: h,
    },
    collaboraDrainage: {
      documents: 0,
      users: 0,
      inFlight: 0,
      failedSaves: 0,
      unknownOutcomes: 0,
      producerCoverageComplete: true,
      holdActive: true,
      stableWatermarkSha256: h,
      sealedDrainReceiptSha256: h,
    },
    independentWatchdog: {
      independent: true,
      active: true,
      heartbeatFresh: true,
      latchClear: true,
      failureRehearsalSha256: h,
      heartbeatSha256: h,
    },
    persistentFiveZero: {
      exactFiveServiceIdentities: true,
      desiredReplicas: 0,
      activeTasks: 0,
      approvedServiceIdsSha256: h,
      approvedSpecTransitionSha256: h,
    },
    legacyIsolation: { unchanged: true, baselineSha256: h, observedSha256: h },
  }
  const observation = (check: string) => ({
    version: 1 as const,
    target: DEV_TARGET,
    sourceSha: evidence.sourceSha,
    phase: 'migration' as const,
    check,
    observedAt: new Date(now).toISOString(),
    facts: facts[check]!,
  })
  return {
    directory,
    policy,
    evidence,
    approval,
    restore,
    key: Buffer.from(key.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    publicKey: key.publicKey,
    now: () => now,
    probe: async (spec: { executable: string }) => observation(spec.executable),
    facts,
    observation,
  }
}
describe('independent DEV observation/signing adapter', () => {
  it('signs truthful maintenance observations using the existing owner pin and monitor key', async () => {
    const f = fixture(true),
      result = await monitorOnce(f)
    expect(result.payload.checks.writerExclusion).toBeUndefined()
    expect(result.payload.checks.ownerMaintenanceHold?.passed).toBe(true)
    expect(
      JSON.parse(
        readFileSync(
          join(
            f.directory,
            'observations',
            result.payload.checks.ownerMaintenanceHold!.evidenceSha256 + '.json',
          ),
          'utf8',
        ),
      ).facts.technicalExclusion,
    ).toBe(false)
  })
  it.each([
    'technicalExclusion',
    'ownerHoldActive',
    'workflow373396385Disabled',
    'unapprovedDeployments',
    'queuedDeployments',
    'unexpectedSpecChanges',
    'unapprovedPostgresClients',
    'unapprovedRedisClients',
    'storageWriters',
    'holdReceiptSha256',
    'missing',
  ])('latches maintenance stop on %s drift', async (field) => {
    const f = fixture(true)
    await monitorOnce(f)
    const facts = f.facts.ownerMaintenanceHold!
    if (field === 'missing') delete f.policy.probes.ownerMaintenanceHold
    else
      facts[field] =
        typeof facts[field] === 'boolean'
          ? !facts[field]
          : typeof facts[field] === 'number'
            ? 1
            : '0'.repeat(64)
    await expect(monitorOnce(f)).rejects.toThrow()
    expect(existsSync(join(f.directory, 'safety.json'))).toBe(false)
    expect(existsSync(join(f.directory, 'monitor-stopped.json'))).toBe(true)
  })
  it('caps receipt lifetime at the hold expiry and fails closed at expiry', async () => {
    const f = fixture(true)
    f.approval.maintenanceHold!.expiresAt = new Date(now + 1000).toISOString()
    const result = await monitorOnce(f)
    expect(result.payload.expiresAt).toBe(f.approval.maintenanceHold!.expiresAt)
    f.now = () => now + 1000
    await expect(monitorOnce(f)).rejects.toThrow()
    expect(existsSync(join(f.directory, 'safety.json'))).toBe(false)
  })
  it('requires the bound host and independent Linux system-service cgroup', () => {
    const host = 'synthetic-host',
      cgroup = '0::/system.slice/uvanoo-dev-release-monitor.service'
    expect(() => requireMonitorService(host, cgroup, sha(host))).not.toThrow()
    for (const value of [
      '0::/user.slice/uvanoo-dev-release-monitor.service',
      '0::/system.slice/github-runner.service',
      '0::/system.slice/uvanoo-dev-release-monitor.service/child',
      '0::/system.slice/uvanoo-dev-recovery-watchdog.service',
    ])
      expect(() => requireMonitorService(host, value, sha(host))).toThrow()
    expect(() => requireMonitorService(host, cgroup, sha('wrong-host'))).toThrow()
  })
  it('prepares a new exact-SHA private bundle without keys or successful safety evidence', () => {
    const f = fixture()
    const files = Object.fromEntries(
      Object.entries({
        policy: f.policy,
        manifest: f.evidence,
        approval: f.approval,
        restore: f.restore,
      }).map(([k, v]) => [k, Buffer.from(canonical(v))]),
    ) as Record<'policy' | 'manifest' | 'approval' | 'restore', Buffer>
    const destination = prepareMonitorDirectory(f.directory, files, sha(files.policy))
    expect(destination).toBe(join(f.directory, f.evidence.sourceSha))
    expect(existsSync(join(destination, 'safety.json'))).toBe(false)
    expect(existsSync(join(destination, 'monitor-policy.json'))).toBe(true)
    expect(() => prepareMonitorDirectory(f.directory, files, sha(files.policy))).toThrow()
    expect(() =>
      prepareMonitorDirectory(
        f.directory,
        { ...files, restore: Buffer.from('{}') },
        sha(files.policy),
      ),
    ).toThrow()
  })
  it('produces verifiable bounded receipts and retains aggregate hash evidence', async () => {
    const f = fixture(),
      envelope = await monitorOnce(f)
    expect(
      verify(
        null,
        Buffer.from(canonical(envelope.payload)),
        f.publicKey,
        Buffer.from(envelope.signature, 'base64'),
      ),
    ).toBe(true)
    expect(Date.parse(envelope.payload.expiresAt) - now).toBe(10_000)
    for (const check of Object.values(envelope.payload.checks))
      expect(
        sha(readFileSync(join(f.directory, 'observations', check.evidenceSha256 + '.json'))),
      ).toBe(check.evidenceSha256)
    expect(JSON.parse(readFileSync(join(f.directory, 'safety.json'), 'utf8'))).toEqual(envelope)
  })
  it.each([
    'writerExclusion',
    'collaboraDrainage',
    'independentWatchdog',
    'persistentFiveZero',
    'legacyIsolation',
  ])('fails closed on missing %s', async (check) => {
    const f = fixture()
    delete f.policy.probes[check]
    await expect(monitorOnce(f)).rejects.toThrow('DEV_MONITOR_STOPPED')
    expect(existsSync(join(f.directory, 'safety.json'))).toBe(false)
    expect(existsSync(join(f.directory, 'monitor-stopped.json'))).toBe(true)
  })
  it.each(['inFlight', 'failedSaves', 'unknownOutcomes', 'documents', 'users'])(
    'rejects unresolved drainage %s',
    async (field) => {
      const f = fixture()
      f.facts.collaboraDrainage![field] = 1
      await expect(monitorOnce(f)).rejects.toThrow()
    },
  )
  it.each([
    'source',
    'target',
    'phase',
    'stale',
    'future',
    'extra',
    'legacy',
    'key',
    'expiry',
    'capture',
    'slow',
    'stopped',
  ])('rejects %s drift', async (kind) => {
    const f = fixture()
    if (kind === 'source') f.policy.sourceSha = '0'.repeat(40)
    if (kind === 'target')
      f.policy.target = { ...DEV_TARGET, environment: 'production' } as unknown as typeof DEV_TARGET
    if (kind === 'phase') f.policy.phase = 'web'
    if (kind === 'legacy') f.facts.legacyIsolation!.observedSha256 = '0'.repeat(64)
    if (kind === 'key')
      f.key = Buffer.from(
        generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }),
      )
    if (kind === 'expiry') f.approval.expiresAt = new Date(now).toISOString()
    if (kind === 'capture') f.evidence.backup.createdAt = new Date(now - 3600_001).toISOString()
    if (kind === 'stopped') latchMonitor(f.directory)
    if (kind === 'slow') {
      let n = 0
      f.now = () => now + (n++ === 0 ? 0 : 6000)
    }
    if (['stale', 'future', 'extra'].includes(kind))
      f.probe = async (spec) => {
        const o = f.observation(spec.executable)
        if (kind === 'extra') o.facts = { ...o.facts, token: 'synthetic-not-a-secret' }
        else o.observedAt = new Date(now + (kind === 'stale' ? -1 : 1)).toISOString()
        return o
      }
    await expect(monitorOnce(f)).rejects.toThrow()
    expect(existsSync(join(f.directory, 'safety.json'))).toBe(false)
  })
  it('revokes a previous receipt on probe failure and does not auto-rearm', async () => {
    const f = fixture()
    await monitorOnce(f)
    f.probe = async () => {
      throw new Error('do not log subprocess content')
    }
    await expect(monitorOnce(f)).rejects.toThrow('DEV_MONITOR_STOPPED')
    expect(existsSync(join(f.directory, 'safety.json'))).toBe(false)
    await expect(monitorOnce(fixtureLike(f))).rejects.toThrow()
    function fixtureLike(value: typeof f) {
      return {
        ...value,
        probe: async (spec: { executable: string }) => f.observation(spec.executable),
      }
    }
  })
  it('does not republish when stopped during collection', async () => {
    const f = fixture()
    f.probe = async (spec) => {
      latchMonitor(f.directory)
      return f.observation(spec.executable)
    }
    await expect(monitorOnce(f)).rejects.toThrow()
    expect(existsSync(join(f.directory, 'safety.json'))).toBe(false)
  })
  it('rejects incomplete aggregate facts', () => {
    const f = fixture(),
      o = f.observation('writerExclusion')
    delete o.facts.directDockerWritersExcluded
    expect(() => validateObservation(o, 'writerExclusion', f.policy, now, now)).toThrow()
  })
  it('executes only a checksum-bound subprocess with no inherited secrets', async () => {
    const f = fixture(),
      script = join(f.directory, 'probe.cjs'),
      executable = realpathSync(process.execPath)
    writeFileSync(
      script,
      'process.stdout.write(JSON.stringify({envKeys:Object.keys(process.env).sort()}))',
      { mode: 0o600 },
    )
    const result = await runProbe({
      executable,
      sha256: sha(readFileSync(executable)),
      dependencies: { [script]: sha(readFileSync(script)) },
      args: [script],
    })
    // macOS adds its own text-encoding variable even with an explicit empty env.
    expect(result).toEqual({
      envKeys:
        process.platform === 'darwin'
          ? ['LANG', 'PATH', '__CF_USER_TEXT_ENCODING']
          : ['LANG', 'PATH'],
    })
    await expect(
      runProbe({ executable, sha256: '0'.repeat(64), dependencies: {}, args: [script] }),
    ).rejects.toThrow()
  })
  it('bounds a hanging probe and rejects malformed/oversized output without logging it', async () => {
    const f = fixture(),
      script = join(f.directory, 'probe.cjs'),
      executable = realpathSync(process.execPath)
    for (const source of [
      'setInterval(()=>{},100)',
      'console.log("not json")',
      'console.log("x".repeat(20000))',
    ]) {
      writeFileSync(script, source, { mode: 0o600 })
      await expect(
        runProbe({
          executable,
          sha256: sha(readFileSync(executable)),
          dependencies: { [script]: sha(readFileSync(script)) },
          args: [script],
        }),
      ).rejects.toThrow()
    }
  }, 10_000)
})
