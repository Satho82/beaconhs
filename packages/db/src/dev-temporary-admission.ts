import { createHash, createPublicKey, verify } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { canonical, LOGICAL_SCHEMA_PROFILE } from './dev-logical-catalog'
import type { ReleaseEvidence } from './dev-migration-gate'

export const DEV_TARGET = Object.freeze({
  repository: 'Satho82/beaconhs',
  environment: 'dev',
  composeId: 'wYb0LxLQrvj2FPI21i-Oj',
  stack: 'uvanoo-v1-4-dev-gniriv',
  host: 'dev.uvanoo.com',
  database: 'beaconhs',
  databaseHost: 'uvanoo-dev-postgres',
  network: 'uvanoo-dev-private',
})
export const TEMPORARY_CLASS = 'DEV_TEMPORARY_RECOVERY_V1' as const
export type AdmissionPhase = 'migration' | 'web'
export type TemporaryAdmission = {
  class: typeof TEMPORARY_CLASS
  immutable: false
  productionEligible: false
  approvalFile: 'owner-approval.json'
  approvalSha256: string
  restoreReceiptFile: 'private-restore.json'
  restoreReceiptSha256: string
}
export type TemporaryApproval = {
  version: 1
  class: typeof TEMPORARY_CLASS
  immutable: false
  productionEligible: false
  owner: string
  auditId: string
  issuedAt: string
  expiresAt: string
  target: typeof DEV_TARGET
  databaseOid: number
  sourceSha: string
  sourceTree: string
  imageDigest: string
  backupSha256: string
  restoreReceiptSha256: string
  sourceHostSha256: string
  restoreHostSha256: string
  recipientSha256: string
  monitorId: string
  // Required for the normal independent Ed25519 monitor path. The strictly
  // DEV-only documented path must omit it, so it cannot be mistaken for an
  // independently attested admission.
  safetyPublicKeyDer?: string
  capabilities: AdmissionPhase[]
  acceptedRisks: ['non-immutable', 'owner-device-loss', 'post-snapshot-write-loss']
  // Optional exact-DEV alternative, covered by the existing owner approval pin.
  // The owner/auditId above authorize coordination, NOT exclusion of privileged operators.
  maintenanceHold?: {
    technicalExclusion: false
    privilegedOperatorRiskAccepted: true
    startsAt: string
    expiresAt: string
    receiptSha256: string
  }
  // An explicit, deliberately weaker DEV-only alternative to the independent
  // monitor signature. It is valid only together with maintenanceHold and is
  // still pinned by the existing private owner-approval bytes.
  operationalEvidence?: {
    mode: 'documented-operational'
    independentAttestation: false
  }
}
export type PrivateRestoreReceipt = {
  version: 1
  runId: string
  target: typeof DEV_TARGET
  databaseOid: number
  sourceSha: string
  sourceTree: string
  imageDigest: string
  backupSha256: string
  sourceHostSha256: string
  restoreHostSha256: string
  recipientSha256: string
  capturedAt: string
  restoredAt: string
  schemaProfile: typeof LOGICAL_SCHEMA_PROFILE
  sourceRawCatalogSha256: string
  restoredRawCatalogSha256: string
  sourceSchemaHash: string
  restoredSchemaHash: string
  sourceLedgerHash: string
  restoredLedgerHash: string
  sourceDataHash: string
  restoredDataHash: string
  catalogSections: 19
  postgresVersion: '160015'
  pristineRetained: true
}
const MIGRATION_CHECKS = [
  'writerExclusion',
  'independentWatchdog',
  'persistentFiveZero',
  'legacyIsolation',
] as const
export const WEB_CHECKS = [
  ...MIGRATION_CHECKS,
  'minioContents',
  'minioCredentials',
  'objectReferences',
  'crossStoreConsistency',
  'queueSafety',
] as const
export type SafetyReceipt = {
  version: 1
  attestation: 'ed25519' | 'documented-operational'
  target: typeof DEV_TARGET
  approvalSha256: string
  sourceSha: string
  imageDigest: string
  backupSha256: string
  monitorId: string
  phase: AdmissionPhase
  observedAt: string
  expiresAt: string
  checks: Record<string, { passed: true; evidenceSha256: string }>
}
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
function requireValue(ok: unknown): asserts ok {
  if (!ok) throw new Error('DEV temporary admission rejected')
}
function exactTarget(target: unknown) {
  requireValue(canonical(target) === canonical(DEV_TARGET))
}
export function usesDocumentedOperationalEvidence(approval: TemporaryApproval) {
  const evidence = approval.operationalEvidence
  if (evidence === undefined) return false
  requireValue(
    approval.maintenanceHold !== undefined &&
      approval.safetyPublicKeyDer === undefined &&
      canonical(Object.keys(evidence).sort()) === canonical(['independentAttestation', 'mode']) &&
      evidence.mode === 'documented-operational' &&
      evidence.independentAttestation === false,
  )
  return true
}
export function admissionChecks(phase: AdmissionPhase, approval: TemporaryApproval): string[] {
  return (phase === 'web' ? WEB_CHECKS : MIGRATION_CHECKS).map((check) =>
    check === 'writerExclusion' && approval.maintenanceHold !== undefined
      ? 'ownerMaintenanceHold'
      : check,
  )
}
/** Reuse the existing pinned owner/audit decision; no roster or additional signing system. */
export function maintenanceHoldExpiry(approval: TemporaryApproval, now: number): number {
  if (approval.maintenanceHold === undefined) return Date.parse(approval.expiresAt)
  const hold = approval.maintenanceHold
  exactTarget(approval.target)
  requireValue(hold && typeof hold === 'object')
  requireValue(
    canonical(Object.keys(hold).sort()) ===
      canonical(
        [
          'technicalExclusion',
          'privilegedOperatorRiskAccepted',
          'startsAt',
          'expiresAt',
          'receiptSha256',
        ].sort(),
      ),
  )
  const starts = Date.parse(hold.startsAt),
    expires = Date.parse(hold.expiresAt)
  requireValue(
    hold.technicalExclusion === false &&
      hold.privilegedOperatorRiskAccepted === true &&
      hash(hold.receiptSha256) &&
      Number.isFinite(starts) &&
      Number.isFinite(expires) &&
      starts <= now &&
      now < expires &&
      expires - starts <= 2 * 3600_000,
  )
  return Math.min(expires, Date.parse(approval.expiresAt))
}
function requireDevContext(env: NodeJS.ProcessEnv) {
  requireValue(
    env.FEATURE_CANDIDATE_VERIFIED === 'true' &&
      env.DEV_RELEASE_ENVIRONMENT === 'dev' &&
      env.DOKPLOY_COMPOSE_ID === DEV_TARGET.composeId &&
      env.EXPECTED_DOKPLOY_STACK === DEV_TARGET.stack &&
      env.EXPECTED_APP_HOST === DEV_TARGET.host &&
      env.EXPECTED_MIGRATION_HOST === DEV_TARGET.databaseHost &&
      env.MIGRATION_DOCKER_NETWORK === DEV_TARGET.network &&
      env.GITHUB_REPOSITORY === DEV_TARGET.repository,
  )
}
export function requireTemporaryDatabaseTarget(
  value: string,
  role: 'beaconhs_backup' | 'beaconhs_migrator',
) {
  try {
    const u = new URL(value)
    requireValue(
      u.protocol === 'postgresql:' &&
        u.hostname === DEV_TARGET.databaseHost &&
        (u.port || '5432') === '5432' &&
        u.pathname === '/beaconhs' &&
        decodeURIComponent(u.username) === role &&
        Boolean(u.password) &&
        !u.hash,
    )
    const allowed = new Set([
      'sslmode',
      'sslrootcert',
      'sslcert',
      'sslkey',
      'connect_timeout',
      'application_name',
      'channel_binding',
    ])
    for (const key of u.searchParams.keys()) requireValue(allowed.has(key))
  } catch {
    throw new Error('DEV temporary database target rejected')
  }
}
export function privateEvidenceFile(directory: string, filename: string): Buffer {
  requireValue(
    /^[a-zA-Z0-9_-]+\.(json|age)$/.test(filename) || /^[a-zA-Z0-9_-]+\.dump\.age$/.test(filename),
  )
  const path = resolve(directory, filename)
  requireValue(
    realpathSync(directory) === resolve(directory) && dirname(path) === resolve(directory),
  )
  const stat = lstatSync(path)
  requireValue(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      realpathSync(path) === path &&
      (stat.mode & 0o022) === 0,
  )
  return readFileSync(path)
}
/** Pure validation of owner-pinned receipts; no private signing keys are consumed here. */
export function validateTemporaryAdmission(
  e: ReleaseEvidence,
  approval: TemporaryApproval,
  receipt: PrivateRestoreReceipt,
  safety: { payload: SafetyReceipt; signature: string },
  pinnedApproval: string,
  phase: AdmissionPhase,
  env: NodeJS.ProcessEnv,
  now = Date.now(),
) {
  requireDevContext(env)
  const a = e.admission
  requireValue(
    e.version === 2 &&
      e.schemaProfile === LOGICAL_SCHEMA_PROFILE &&
      a?.class === TEMPORARY_CLASS &&
      a.immutable === false &&
      a.productionEligible === false &&
      hash(pinnedApproval) &&
      a.approvalSha256 === pinnedApproval,
  )
  exactTarget(approval.target)
  exactTarget(receipt.target)
  exactTarget(safety.payload.target)
  const holdExpires = maintenanceHoldExpiry(approval, now)
  const documentedOperational = usesDocumentedOperationalEvidence(approval)
  if (approval.maintenanceHold !== undefined)
    requireValue(Date.parse(approval.maintenanceHold.startsAt) <= Date.parse(e.backup.createdAt))
  const created = Date.parse(e.backup.createdAt),
    issued = Date.parse(approval.issuedAt),
    expires = Date.parse(approval.expiresAt)
  requireValue(
    approval.version === 1 &&
      approval.class === TEMPORARY_CLASS &&
      approval.immutable === false &&
      approval.productionEligible === false &&
      typeof approval.owner === 'string' &&
      approval.owner.trim().length > 0 &&
      /^[a-zA-Z0-9_-]{8,100}$/.test(approval.auditId) &&
      Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      created <= issued &&
      issued <= now &&
      now - created <= 3600_000 &&
      now < expires &&
      expires - created <= 72 * 3600_000 &&
      Date.parse(receipt.restoredAt) <= issued &&
      Date.parse(receipt.restoredAt) >= created &&
      canonical(approval.acceptedRisks) ===
        canonical(['non-immutable', 'owner-device-loss', 'post-snapshot-write-loss']) &&
      Array.isArray(approval.capabilities) &&
      approval.capabilities.length > 0 &&
      new Set(approval.capabilities).size === approval.capabilities.length &&
      approval.capabilities.every((x) => x === 'migration' || x === 'web') &&
      approval.capabilities.includes(phase),
  )
  for (const key of ['sourceSha', 'sourceTree', 'imageDigest', 'databaseOid'] as const)
    requireValue(approval[key] === e[key] && receipt[key] === e[key])
  requireValue(
    Number.isSafeInteger(e.databaseOid) &&
      e.databaseOid > 0 &&
      e.database === DEV_TARGET.database &&
      e.postgresVersion === '160015' &&
      approval.backupSha256 === e.backup.sha256 &&
      receipt.backupSha256 === e.backup.sha256 &&
      approval.restoreReceiptSha256 === a.restoreReceiptSha256,
  )
  for (const key of ['sourceHostSha256', 'restoreHostSha256', 'recipientSha256'] as const)
    requireValue(hash(approval[key]) && receipt[key] === approval[key])
  requireValue(
    approval.sourceHostSha256 !== approval.restoreHostSha256 &&
      receipt.version === 1 &&
      /^[a-zA-Z0-9_-]{8,100}$/.test(receipt.runId) &&
      e.backup.restoreRun === 'private:' + receipt.runId &&
      receipt.capturedAt === e.backup.createdAt &&
      receipt.restoredAt === e.backup.restoredAt &&
      receipt.schemaProfile === LOGICAL_SCHEMA_PROFILE &&
      receipt.catalogSections === 19 &&
      receipt.postgresVersion === '160015' &&
      receipt.pristineRetained === true &&
      hash(receipt.sourceRawCatalogSha256) &&
      hash(receipt.restoredRawCatalogSha256),
  )
  for (const [source, restored, expected] of [
    ['sourceSchemaHash', 'restoredSchemaHash', 'schemaHash'],
    ['sourceLedgerHash', 'restoredLedgerHash', 'ledgerHash'],
    ['sourceDataHash', 'restoredDataHash', 'dataHash'],
  ] as const)
    requireValue(receipt[source] === e.backup[expected] && receipt[restored] === e.backup[expected])
  const p = safety.payload,
    observed = Date.parse(p.observedAt),
    validUntil = Date.parse(p.expiresAt)
  requireValue(
    p.version === 1 &&
      p.attestation === (documentedOperational ? 'documented-operational' : 'ed25519') &&
      p.approvalSha256 === pinnedApproval &&
      p.phase === phase &&
      p.sourceSha === e.sourceSha &&
      p.imageDigest === e.imageDigest &&
      p.backupSha256 === e.backup.sha256 &&
      typeof approval.monitorId === 'string' &&
      approval.monitorId.length >= 8 &&
      p.monitorId === approval.monitorId &&
      observed <= now &&
      now - observed <= 10_000 &&
      now < validUntil &&
      validUntil - observed <= 10_000 &&
      validUntil <= expires &&
      validUntil <= holdExpires,
  )
  const checks = admissionChecks(phase, approval)
  requireValue(canonical(Object.keys(p.checks).sort()) === canonical([...checks].sort()))
  requireValue(
    checks.every((k) => p.checks[k]?.passed === true && hash(p.checks[k]?.evidenceSha256)),
  )
  if (documentedOperational) {
    // This is intentionally not described as independent: a privileged DEV
    // operator can alter operational evidence. The exact target, short hold,
    // owner pin and every live data/safety check remain mandatory.
    requireValue(safety.signature === '')
  } else {
    requireValue(typeof approval.safetyPublicKeyDer === 'string')
    const key = createPublicKey({
      key: Buffer.from(approval.safetyPublicKeyDer, 'base64'),
      format: 'der',
      type: 'spki',
    })
    requireValue(
      key.asymmetricKeyType === 'ed25519' &&
        verify(null, Buffer.from(canonical(p)), key, Buffer.from(safety.signature, 'base64')),
    )
  }
}
export function checkTemporaryFiles(
  e: ReleaseEvidence,
  directory: string,
  phase: AdmissionPhase,
  env = process.env,
  now = Date.now(),
) {
  try {
    requireValue(!existsSync(resolve(directory, 'monitor-stopped.json')))
    const a = e.admission
    requireValue(
      a &&
        a.approvalFile === 'owner-approval.json' &&
        a.restoreReceiptFile === 'private-restore.json',
    )
    const approval = privateEvidenceFile(directory, a.approvalFile),
      receipt = privateEvidenceFile(directory, a.restoreReceiptFile)
    requireValue(sha(approval) === a.approvalSha256 && sha(receipt) === a.restoreReceiptSha256)
    validateTemporaryAdmission(
      e,
      JSON.parse(approval.toString()),
      JSON.parse(receipt.toString()),
      JSON.parse(privateEvidenceFile(directory, 'safety.json').toString()),
      env.DEV_TEMPORARY_APPROVAL_SHA256 ?? '',
      phase,
      env,
      now,
    )
    return a.approvalSha256
  } catch {
    throw new Error('DEV temporary admission rejected')
  }
}
