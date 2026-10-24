import { execFile } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { canonical } from './dev-logical-catalog'
import type { ReleaseEvidence } from './dev-migration-gate'
import {
  DEV_TARGET,
  admissionChecks,
  maintenanceHoldExpiry,
  usesDocumentedOperationalEvidence,
  validateTemporaryAdmission,
  type AdmissionPhase,
  type PrivateRestoreReceipt,
  type SafetyReceipt,
  type TemporaryApproval,
} from './dev-temporary-admission'

const execute = promisify(execFile)
const DOCUMENTED_OPERATIONAL_KEY_ARGUMENT = '--documented-operational'
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function requireValue(value: unknown): asserts value {
  if (!value) throw new Error('DEV_MONITOR_REJECTED')
}
export function requireMonitorService(hostIdentity: string, cgroup: string, approvedHost: string) {
  requireValue(
    hash(hostIdentity.trim()) === approvedHost &&
      cgroup
        .split('\n')
        .some((line) =>
          /^\d+:[^:]*:\/system.slice\/uvanoo-dev-release-monitor\.service$/.test(line),
        ),
  )
}
export type ProbeSpec = {
  executable: string
  sha256: string
  // Interpreter, imported sources and private probe config must all be pinned.
  dependencies: Record<string, string>
  args: string[]
}
export type MonitorPolicy = {
  version: 1
  target: typeof DEV_TARGET
  sourceSha: string
  phase: AdmissionPhase
  monitorId: string
  approvalSha256: string
  manifestSha256: string
  probes: Record<string, ProbeSpec>
}
type Observation = {
  version: 1
  target: typeof DEV_TARGET
  sourceSha: string
  phase: AdmissionPhase
  check: string
  observedAt: string
  facts: Record<string, unknown>
}
// Aggregate-only protocol. No URL, account, object name, credential or document content.
const contracts: Record<string, Record<string, 'zero' | 'true' | 'false' | 'hash'>> = {
  ownerMaintenanceHold: {
    technicalExclusion: 'false',
    ownerHoldActive: 'true',
    workflow373396385Disabled: 'true',
    unapprovedDeployments: 'zero',
    queuedDeployments: 'zero',
    unexpectedSpecChanges: 'zero',
    unapprovedPostgresClients: 'zero',
    unapprovedRedisClients: 'zero',
    storageWriters: 'zero',
    holdReceiptSha256: 'hash',
    allowedMigrationConnectionsSha256: 'hash',
  },
  writerExclusion: {
    exclusiveHoldActive: 'true',
    authenticatedDeployersExcluded: 'true',
    directDockerWritersExcluded: 'true',
    unapprovedPostgresClients: 'zero',
    unapprovedRedisClients: 'zero',
    storageWriters: 'zero',
    holdReceiptSha256: 'hash',
    allowedMigrationConnectionsSha256: 'hash',
  },
  independentWatchdog: {
    independent: 'true',
    active: 'true',
    heartbeatFresh: 'true',
    latchClear: 'true',
    failureRehearsalSha256: 'hash',
    heartbeatSha256: 'hash',
  },
  persistentFourZero: {
    exactFourServiceIdentities: 'true',
    desiredReplicas: 'zero',
    activeTasks: 'zero',
    approvedServiceIdsSha256: 'hash',
    approvedSpecTransitionSha256: 'hash',
  },
  legacyIsolation: { unchanged: 'true', baselineSha256: 'hash', observedSha256: 'hash' },
  minioContents: {
    complete: 'true',
    retainedVolumeIdentityVerified: 'true',
    inventorySha256: 'hash',
  },
  minioCredentials: {
    adminIdentityVerified: 'true',
    appIdentityVerified: 'true',
    receiptSha256: 'hash',
  },
  objectReferences: {
    missingObjects: 'zero',
    mismatchedObjects: 'zero',
    allReferencesCovered: 'true',
    receiptSha256: 'hash',
  },
  crossStoreConsistency: {
    consistent: 'true',
    noWriterIntervalVerified: 'true',
    receiptSha256: 'hash',
  },
  queueSafety: { outboundExcluded: 'true', inventoryVerified: 'true', receiptSha256: 'hash' },
}
function keys(value: object, expected: string[]) {
  requireValue(canonical(Object.keys(value).sort()) === canonical([...expected].sort()))
}
export function validateObservation(
  value: Observation,
  check: string,
  policy: MonitorPolicy,
  started: number,
  now: number,
) {
  keys(value, ['version', 'target', 'sourceSha', 'phase', 'check', 'observedAt', 'facts'])
  requireValue(
    value.version === 1 &&
      canonical(value.target) === canonical(DEV_TARGET) &&
      value.sourceSha === policy.sourceSha &&
      value.phase === policy.phase &&
      value.check === check,
  )
  const observed = Date.parse(value.observedAt)
  requireValue(
    Number.isFinite(observed) && observed >= started && observed <= now && now - observed <= 5000,
  )
  const contract = contracts[check]
  requireValue(contract)
  keys(value.facts, Object.keys(contract))
  for (const [field, type] of Object.entries(contract)) {
    const v = value.facts[field]
    requireValue(
      type === 'zero'
        ? v === 0
        : type === 'true'
          ? v === true
          : type === 'false'
            ? v === false
            : digest(v),
    )
  }
  if (check === 'legacyIsolation')
    requireValue(value.facts.baselineSha256 === value.facts.observedSha256)
  return observed
}
function privateDirectory(path: string) {
  const s = lstatSync(path)
  requireValue(
    isAbsolute(path) &&
      realpathSync(path) === path &&
      s.isDirectory() &&
      s.uid === process.getuid?.() &&
      (s.mode & 0o022) === 0,
  )
}
function privateBytes(path: string, maximum = 1_048_576): Buffer {
  requireValue(isAbsolute(path) && realpathSync(path) === path)
  const s = lstatSync(path)
  requireValue(
    s.isFile() &&
      !s.isSymbolicLink() &&
      s.uid === process.getuid?.() &&
      (s.mode & 0o077) === 0 &&
      s.size <= maximum,
  )
  return readFileSync(path)
}
function pinnedBytes(path: string, expected: string) {
  requireValue(digest(expected) && isAbsolute(path) && realpathSync(path) === path)
  const s = lstatSync(path)
  requireValue(s.isFile() && !s.isSymbolicLink() && (s.mode & 0o022) === 0)
  requireValue(hash(readFileSync(path)) === expected)
}
/** Probe subprocesses receive no inherited environment, signing key or shell. */
export async function runProbe(spec: ProbeSpec) {
  keys(spec, ['executable', 'sha256', 'dependencies', 'args'])
  pinnedBytes(spec.executable, spec.sha256)
  requireValue(
    Array.isArray(spec.args) &&
      spec.args.every((v) => typeof v === 'string') &&
      spec.args.length <= 20,
  )
  for (const [path, sha] of Object.entries(spec.dependencies)) pinnedBytes(path, sha)
  const { stdout, stderr } = await execute(spec.executable, spec.args, {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    cwd: '/',
    timeout: 2500,
    killSignal: 'SIGKILL',
    maxBuffer: 16384,
  })
  requireValue(stderr.length === 0)
  return JSON.parse(stdout) as Observation
}
function atomic(directory: string, name: string, bytes: string) {
  const temporary = join(directory, '.' + randomUUID())
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, bytes)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(temporary, join(directory, name))
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
  const parent = openSync(directory, 'r')
  try {
    fsyncSync(parent)
  } finally {
    closeSync(parent)
  }
}
/** Prepare only a new private directory; never overwrite or assert live readiness.
 * Caller supplies independently approved policy bytes/hash. No keys or ciphertext
 * are synthesized or copied by this function. Capture is a separately approved step. */
export function prepareMonitorDirectory(
  parent: string,
  files: { policy: Buffer; manifest: Buffer; approval: Buffer; restore: Buffer },
  policySha: string,
) {
  privateDirectory(parent)
  requireValue(digest(policySha) && hash(files.policy) === policySha)
  const policy = JSON.parse(files.policy.toString()) as MonitorPolicy
  const manifest = JSON.parse(files.manifest.toString()) as ReleaseEvidence
  const approval = JSON.parse(files.approval.toString()) as TemporaryApproval
  const restore = JSON.parse(files.restore.toString()) as PrivateRestoreReceipt
  requireValue(
    /^[a-f0-9]{40}$/.test(policy.sourceSha) &&
      canonical(policy.target) === canonical(DEV_TARGET) &&
      canonical(approval.target) === canonical(DEV_TARGET) &&
      canonical(restore.target) === canonical(DEV_TARGET) &&
      manifest.sourceSha === policy.sourceSha &&
      approval.sourceSha === policy.sourceSha &&
      restore.sourceSha === policy.sourceSha &&
      manifest.version === 2 &&
      hash(files.manifest) === policy.manifestSha256 &&
      hash(files.approval) === policy.approvalSha256 &&
      manifest.admission?.approvalSha256 === policy.approvalSha256 &&
      hash(files.restore) === manifest.admission?.restoreReceiptSha256 &&
      approval.restoreReceiptSha256 === manifest.admission?.restoreReceiptSha256,
  )
  const destination = join(parent, policy.sourceSha)
  // mkdir without recursive prevents reuse, overwrite and symlink substitution.
  mkdirSync(destination, { mode: 0o700 })
  for (const [name, bytes] of Object.entries({
    'monitor-policy.json': files.policy,
    'manifest.json': files.manifest,
    'owner-approval.json': files.approval,
    'private-restore.json': files.restore,
  }))
    atomic(destination, name, bytes.toString())
  return destination
}
export function latchMonitor(directory: string) {
  // Only names owned by this monitor. Never remove backup or restore evidence.
  if (existsSync(join(directory, 'safety.json'))) unlinkSync(join(directory, 'safety.json'))
  atomic(directory, 'monitor-stopped.json', canonical({ version: 1, status: 'STOPPED' }))
}
export async function monitorOnce(options: {
  directory: string
  policy: MonitorPolicy
  evidence: ReleaseEvidence
  approval: TemporaryApproval
  restore: PrivateRestoreReceipt
  key?: Buffer
  probe?: typeof runProbe
  now?: () => number
}) {
  const { directory, policy, evidence, approval, restore } = options
  const now = options.now ?? Date.now
  privateDirectory(directory)
  requireValue(!existsSync(join(directory, 'monitor-stopped.json')))
  try {
    const started = now()
    keys(policy, [
      'version',
      'target',
      'sourceSha',
      'phase',
      'monitorId',
      'approvalSha256',
      'manifestSha256',
      'probes',
    ])
    requireValue(
      policy.version === 1 &&
        canonical(policy.target) === canonical(DEV_TARGET) &&
        policy.sourceSha === evidence.sourceSha &&
        policy.monitorId === approval.monitorId &&
        (policy.phase === 'migration' || policy.phase === 'web'),
    )
    const holdExpires = maintenanceHoldExpiry(approval, started)
    const checks = admissionChecks(policy.phase, approval)
    keys(policy.probes, [...checks])
    const documentedOperational = usesDocumentedOperationalEvidence(approval)
    const key = documentedOperational ? undefined : createPrivateKey(options.key!)
    if (documentedOperational) requireValue(options.key === undefined)
    else
      requireValue(
        key?.asymmetricKeyType === 'ed25519' &&
          createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64') ===
            approval.safetyPublicKeyDer,
      )
    const observations = await Promise.all(
      checks.map(async (check) => {
        const value = await (options.probe ?? runProbe)(policy.probes[check]!)
        const stamp = validateObservation(value, check, policy, started, now())
        if (check === 'ownerMaintenanceHold')
          requireValue(value.facts.holdReceiptSha256 === approval.maintenanceHold?.receiptSha256)
        return { check, stamp, bytes: canonical(value) }
      }),
    )
    const finished = now()
    requireValue(finished >= started && finished - started <= 5000)
    const observed = Math.min(...observations.map((v) => v.stamp))
    const payload: SafetyReceipt = {
      version: 1,
      attestation: documentedOperational ? 'documented-operational' : 'ed25519',
      target: DEV_TARGET,
      approvalSha256: policy.approvalSha256,
      sourceSha: evidence.sourceSha,
      imageDigest: evidence.imageDigest,
      backupSha256: evidence.backup.sha256,
      monitorId: policy.monitorId,
      phase: policy.phase,
      observedAt: new Date(observed).toISOString(),
      expiresAt: new Date(Math.min(observed + 10_000, holdExpires)).toISOString(),
      checks: Object.fromEntries(
        observations.map((v) => [v.check, { passed: true, evidenceSha256: hash(v.bytes) }]),
      ),
    }
    const envelope = {
      payload,
      signature: documentedOperational
        ? ''
        : sign(null, Buffer.from(canonical(payload)), key!).toString('base64'),
    }
    // Reuse the exact consumer validation before publishing, including one-hour capture freshness.
    validateTemporaryAdmission(
      evidence,
      approval,
      restore,
      envelope,
      policy.approvalSha256,
      policy.phase,
      {
        FEATURE_CANDIDATE_VERIFIED: 'true',
        DEV_RELEASE_ENVIRONMENT: 'dev',
        DOKPLOY_COMPOSE_ID: DEV_TARGET.composeId,
        EXPECTED_DOKPLOY_STACK: DEV_TARGET.stack,
        EXPECTED_APP_HOST: DEV_TARGET.host,
        EXPECTED_MIGRATION_HOST: DEV_TARGET.databaseHost,
        MIGRATION_DOCKER_NETWORK: DEV_TARGET.network,
        GITHUB_REPOSITORY: DEV_TARGET.repository,
      },
      finished,
    )
    const archive = join(directory, 'observations')
    if (!existsSync(archive)) mkdirSync(archive, { mode: 0o700 })
    privateDirectory(archive)
    for (const v of observations) atomic(archive, hash(v.bytes) + '.json', v.bytes)
    requireValue(!existsSync(join(directory, 'monitor-stopped.json')) && now() - observed < 10_000)
    atomic(directory, 'safety.json', canonical(envelope))
    return envelope
  } catch {
    latchMonitor(directory)
    throw new Error('DEV_MONITOR_STOPPED')
  }
}
/** No live defaults: explicit policy digest, private receipt paths and separate key custody. */
export async function runMonitor(
  directory: string,
  policyPath: string,
  policySha: string,
  keyPath: string,
) {
  privateDirectory(directory)
  requireValue(isAbsolute(keyPath) && !resolve(keyPath).startsWith(directory + '/'))
  const policyBytes = privateBytes(policyPath)
  requireValue(digest(policySha) && hash(policyBytes) === policySha)
  const policy = JSON.parse(policyBytes.toString()) as MonitorPolicy
  requireValue(
    dirname(directory).endsWith('/release-evidence') && directory.endsWith('/' + policy.sourceSha),
  )
  const manifest = privateBytes(join(directory, 'manifest.json'))
  const approvalBytes = privateBytes(join(directory, 'owner-approval.json'))
  requireValue(
    hash(manifest) === policy.manifestSha256 && hash(approvalBytes) === policy.approvalSha256,
  )
  const evidence = JSON.parse(manifest.toString()) as ReleaseEvidence
  const approval = JSON.parse(approvalBytes.toString()) as TemporaryApproval
  const documentedOperational = usesDocumentedOperationalEvidence(approval)
  requireValue(
    documentedOperational
      ? keyPath === DOCUMENTED_OPERATIONAL_KEY_ARGUMENT
      : keyPath !== DOCUMENTED_OPERATIONAL_KEY_ARGUMENT,
  )
  requireValue(process.platform === 'linux')
  requireMonitorService(
    readFileSync('/etc/machine-id', 'utf8'),
    readFileSync('/proc/self/cgroup', 'utf8'),
    approval.sourceHostSha256,
  )
  const restoreBytes = privateBytes(join(directory, 'private-restore.json'))
  requireValue(hash(restoreBytes) === evidence.admission?.restoreReceiptSha256)
  const restore = JSON.parse(restoreBytes.toString()) as PrivateRestoreReceipt
  const key = documentedOperational ? undefined : privateBytes(keyPath, 16384)
  // Exclusive persistent lock: after crash/stop an operator must review and re-arm, never auto-resume.
  const lock = openSync(join(directory, 'monitor.lock'), 'wx', 0o600)
  closeSync(lock)
  let stopped = false
  const stop = () => {
    stopped = true
    latchMonitor(directory)
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  try {
    while (!stopped) {
      requireValue(
        hash(privateBytes(policyPath)) === policySha &&
          hash(privateBytes(join(directory, 'manifest.json'))) === policy.manifestSha256 &&
          hash(privateBytes(join(directory, 'owner-approval.json'))) === policy.approvalSha256 &&
          hash(privateBytes(join(directory, 'private-restore.json'))) ===
            evidence.admission?.restoreReceiptSha256,
      )
      await monitorOnce({ directory, policy, evidence, approval, restore, key })
      if (stopped) {
        latchMonitor(directory)
        break
      }
      await new Promise((done) => setTimeout(done, 1000))
    }
  } finally {
    key?.fill(0)
    process.removeListener('SIGTERM', stop)
    process.removeListener('SIGINT', stop)
    latchMonitor(directory)
  }
}
