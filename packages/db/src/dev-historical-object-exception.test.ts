import { describe, expect, it } from 'vitest'
import {
  HISTORICAL_DEV_MISSING_IDENTITIES,
  HISTORICAL_RECOVERY_EVIDENCE_SHA256,
} from './dev-historical-objects-allowlist'
import {
  HISTORICAL_ALLOWLIST_SHA256,
  HISTORICAL_EXCEPTION_ID,
  validateHistoricalException,
  validateHistoricalMissingObservation,
  type HistoricalException,
} from './dev-historical-object-exception'
const target = {
  repository: 'Satho82/beaconhs',
  environment: 'dev',
  composeId: 'wYb0LxLQrvj2FPI21i-Oj',
  stack: 'uvanoo-v1-4-dev-gniriv',
  host: 'dev.uvanoo.com',
  database: 'uvanoo_dev',
  databaseHost: 'uvanoo-dev-postgres',
  network: 'uvanoo-dev-private',
}
const approval: HistoricalException = {
  exceptionId: HISTORICAL_EXCEPTION_ID,
  allowlistSha256: HISTORICAL_ALLOWLIST_SHA256,
  lossAcknowledged: true as const,
  recoveryRequired: true as const,
  recoveryEvidenceSha256: HISTORICAL_RECOVERY_EVIDENCE_SHA256,
}
const facts = () => ({
  missingObjects: 9,
  mismatchedObjects: 0,
  allReferencesCovered: false,
  receiptSha256: 'b'.repeat(64),
  missingIdentitySha256: [...HISTORICAL_DEV_MISSING_IDENTITIES],
  exceptionId: HISTORICAL_EXCEPTION_ID,
  recoveryEvidenceSha256: HISTORICAL_RECOVERY_EVIDENCE_SHA256,
})
describe('exact DEV historical-object exception', () => {
  it('accepts the nine approved records', () =>
    expect(() => validateHistoricalMissingObservation(target, approval, facts())).not.toThrow())
  it('accepts a subset when originals are recovered', () => {
    const x = facts()
    x.missingIdentitySha256.pop()
    x.missingObjects = 8
    expect(() => validateHistoricalMissingObservation(target, approval, x)).not.toThrow()
  })
  it('rejects any new missing object', () => {
    const x = facts()
    x.missingIdentitySha256[0] = 'c'.repeat(64)
    expect(() => validateHistoricalMissingObservation(target, approval, x)).toThrow()
  })
  it('rejects a tenth missing record', () => {
    const x = facts()
    x.missingIdentitySha256.push('d'.repeat(64))
    x.missingObjects = 10
    expect(() => validateHistoricalMissingObservation(target, approval, x)).toThrow()
  })
  it('rejects duplicate identities', () => {
    const x = facts()
    x.missingIdentitySha256[0] = x.missingIdentitySha256[1]!
    expect(() => validateHistoricalMissingObservation(target, approval, x)).toThrow()
  })
  it('rejects count mismatch and altered object', () => {
    const x = facts()
    x.missingObjects = 8
    expect(() => validateHistoricalMissingObservation(target, approval, x)).toThrow()
    x.missingObjects = 9
    x.mismatchedObjects = 1
    expect(() => validateHistoricalMissingObservation(target, approval, x)).toThrow()
  })
  it('cannot hide an approved missing record as healthy', () => {
    const x = facts()
    x.allReferencesCovered = true
    expect(() => validateHistoricalMissingObservation(target, approval, x)).toThrow()
  })
  it('rejects non-DEV and modified approvals', () => {
    expect(() => validateHistoricalException({ environment: 'production' }, approval)).toThrow()
    expect(() =>
      validateHistoricalException(target, { ...approval, recoveryEvidenceSha256: 'd'.repeat(64) }),
    ).toThrow()
    expect(() =>
      validateHistoricalException(target, { ...approval, allowlistSha256: 'f'.repeat(64) }),
    ).toThrow()
    expect(() =>
      validateHistoricalException(target, { ...approval, recoveryRequired: false } as never),
    ).toThrow()
  })
  it('requires the pinned recovery evidence in the live observation', () => {
    const x = facts()
    x.recoveryEvidenceSha256 = 'd'.repeat(64)
    expect(() => validateHistoricalMissingObservation(target, approval, x)).toThrow()
  })
})
