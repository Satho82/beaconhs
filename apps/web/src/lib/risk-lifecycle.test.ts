import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calculateRiskReviewDates,
  compareVersions,
  daysUntilRiskReview,
  riskLifecycleStatus,
} from './risk-lifecycle'

describe('Risk review lifecycle', () => {
  it.each([
    [3, '2027-04-30'],
    [6, '2027-07-31'],
    [12, '2028-01-31'],
    [24, '2029-01-31'],
  ])('calculates a %i month validity period', (months, expected) => {
    expect(
      calculateRiskReviewDates({ effectiveDate: '2027-01-31', validityMonths: months }),
    ).toEqual({ nextReviewDate: expected, expiryDate: expected, validityMonths: months })
  })

  it('supports a custom validity date', () => {
    expect(
      calculateRiskReviewDates({
        effectiveDate: '2027-01-01',
        customReviewDate: '2027-08-19',
      }),
    ).toEqual({
      nextReviewDate: '2027-08-19',
      expiryDate: '2027-08-19',
      validityMonths: null,
    })
  })

  it('rejects a custom review date that is not after adoption', () => {
    expect(() =>
      calculateRiskReviewDates({
        effectiveDate: '2027-01-01',
        customReviewDate: '2027-01-01',
      }),
    ).toThrow(/after/)
  })

  it.each([
    ['draft', '2027-02-01', 'draft'],
    ['retired', '2027-02-01', 'retired'],
    ['active', '2027-04-01', 'active'],
    ['active', '2027-02-15', 'due_soon'],
    ['active', '2027-02-01', 'review_due'],
    ['active', '2027-01-31', 'overdue'],
  ])('derives %s / %s as %s', (storedStatus, nextReviewDate, expected) => {
    expect(
      riskLifecycleStatus({
        storedStatus,
        nextReviewDate,
        reminderLeadDays: 30,
        now: new Date('2027-02-01T12:00:00Z'),
      }),
    ).toBe(expected)
  })

  it('reports days remaining and compares semantic template versions', () => {
    expect(daysUntilRiskReview('2027-02-08', new Date('2027-02-01T12:00:00Z'))).toBe(7)
    expect(compareVersions('1.2', '1.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0', '1.0')).toBe(0)
  })

  it('keeps sign-offs append-only and reminders retry-safe by contract', () => {
    const lifecycle = readFileSync(resolve(import.meta.dirname, 'risk-lifecycle.ts'), 'utf8')
    const scanner = readFileSync(
      resolve(import.meta.dirname, '../../../worker/src/lib/risk-review-scanner.ts'),
      'utf8',
    )
    expect(lifecycle).toContain('insert(riskAssessmentSignoffs)')
    expect(lifecycle).not.toContain('update(riskAssessmentSignoffs)')
    expect(scanner).toContain('sourceJobId')
    expect(scanner).toContain('onConflictDoNothing()')
  })
})
