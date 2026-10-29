import { createHash } from 'node:crypto'
import { canonical } from './dev-logical-catalog'
import {
  HISTORICAL_DEV_MISSING_IDENTITIES,
  HISTORICAL_RECOVERY_EVIDENCE_SHA256,
} from './dev-historical-objects-allowlist'

// Commitments bind exact attachment or branding reference identities.
export const HISTORICAL_EXCEPTION_ID = 'owner-approved-dev-nine-20261029'
export const HISTORICAL_ALLOWLIST_SHA256 = createHash('sha256')
  .update(canonical([...HISTORICAL_DEV_MISSING_IDENTITIES].sort()))
  .digest('hex')

export type HistoricalException = {
  exceptionId: typeof HISTORICAL_EXCEPTION_ID
  allowlistSha256: string
  lossAcknowledged: true
  recoveryRequired: true
  recoveryEvidenceSha256: string
}
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function insist(v: unknown): asserts v {
  if (!v) throw new Error('DEV_HISTORICAL_EXCEPTION_REJECTED')
}

export function validateHistoricalException(
  target: { environment?: string; [key: string]: unknown },
  value: HistoricalException,
) {
  insist(
    canonical(target) ===
      canonical({
        repository: 'Satho82/beaconhs',
        environment: 'dev',
        composeId: 'wYb0LxLQrvj2FPI21i-Oj',
        stack: 'uvanoo-v1-4-dev-gniriv',
        host: 'dev.uvanoo.com',
        database: 'uvanoo_dev',
        databaseHost: 'uvanoo-dev-postgres',
        network: 'uvanoo-dev-private',
      }),
  )
  insist(value !== null && typeof value === 'object')
  insist(
    canonical(Object.keys(value).sort()) ===
      canonical(
        [
          'allowlistSha256',
          'exceptionId',
          'lossAcknowledged',
          'recoveryEvidenceSha256',
          'recoveryRequired',
        ].sort(),
      ),
  )
  insist(
    value.exceptionId === HISTORICAL_EXCEPTION_ID &&
      value.allowlistSha256 === HISTORICAL_ALLOWLIST_SHA256,
  )
  insist(
    value.lossAcknowledged === true &&
      value.recoveryRequired === true &&
      value.recoveryEvidenceSha256 === HISTORICAL_RECOVERY_EVIDENCE_SHA256,
  )
}

export function validateHistoricalMissingObservation(
  target: { environment?: string; [key: string]: unknown },
  exception: HistoricalException,
  facts: Record<string, unknown>,
) {
  validateHistoricalException(target, exception)
  insist(
    canonical(Object.keys(facts).sort()) ===
      canonical(
        [
          'missingObjects',
          'mismatchedObjects',
          'allReferencesCovered',
          'receiptSha256',
          'missingIdentitySha256',
          'exceptionId',
          'recoveryEvidenceSha256',
        ].sort(),
      ),
  )
  const ids = facts.missingIdentitySha256
  insist(
    Array.isArray(ids) && ids.length <= HISTORICAL_DEV_MISSING_IDENTITIES.length && ids.every(hash),
  )
  insist(
    new Set(ids).size === ids.length &&
      ids.every((id) => HISTORICAL_DEV_MISSING_IDENTITIES.includes(id)),
  )
  insist(facts.missingObjects === ids.length && facts.mismatchedObjects === 0)
  insist(facts.allReferencesCovered === (ids.length === 0) && hash(facts.receiptSha256))
  insist(
    facts.exceptionId === exception.exceptionId &&
      facts.recoveryEvidenceSha256 === exception.recoveryEvidenceSha256,
  )
}
