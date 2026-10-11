import { describe, expect, it } from 'vitest'
import { calculateRisk, riskRating } from '@beaconhs/db'
import {
  isHighOrCriticalRiskScore,
  riskActionPriority,
  riskAssessmentMatrix,
  riskRatingForAssessmentScore,
} from './risk-assessment-matrix'

describe('Risk assessment display and report consistency', () => {
  it('uses the persisted 5×5 product score and band for all 25 cells', () => {
    const matrix = riskAssessmentMatrix()
    expect(Object.keys(matrix.cells)).toHaveLength(25)
    for (let severity = 1; severity <= 5; severity++) {
      for (let likelihood = 1; likelihood <= 5; likelihood++) {
        const expected = calculateRisk(likelihood, severity)
        expect(matrix.cells[`${severity - 1}:${likelihood - 1}`]).toMatchObject({
          score: expected.score,
          label: expected.rating,
        })
      }
    }
  })

  it('keeps established threshold boundary values unchanged', () => {
    const matrix = riskAssessmentMatrix()
    expect(riskRatingForAssessmentScore(4, matrix)).toBe('Low')
    expect(riskRatingForAssessmentScore(5, matrix)).toBe('Medium')
    expect(riskRatingForAssessmentScore(9, matrix)).toBe('Medium')
    expect(riskRatingForAssessmentScore(10, matrix)).toBe('High')
    expect(riskRatingForAssessmentScore(16, matrix)).toBe('High')
    expect(riskRating(16)).toBe('High')
    expect(riskRating(17)).toBe('Critical')
    expect(riskRatingForAssessmentScore(20, matrix)).toBe('Critical')
    expect(riskRatingForAssessmentScore(17, matrix)).toBe('Unrated')
    expect(isHighOrCriticalRiskScore(9, matrix)).toBe(false)
    expect(isHighOrCriticalRiskScore(10, matrix)).toBe(true)
  })

  it('uses the tenant matrix cell consistently for every report surface', () => {
    const configured = structuredClone(riskAssessmentMatrix())
    configured.cells['3:3'] = { ...configured.cells['3:3']!, label: 'Urgent', color: '#123456' }
    expect(riskAssessmentMatrix(configured)).toBe(configured)
    expect(riskRatingForAssessmentScore(16, configured)).toBe('Urgent')
    expect(isHighOrCriticalRiskScore(16, configured)).toBe(false)
  })

  it('rejects malformed matrix scores and falls back to the unchanged default', () => {
    const malformed = structuredClone(riskAssessmentMatrix())
    malformed.cells['0:0'] = { ...malformed.cells['0:0']!, score: 8 }
    expect(riskAssessmentMatrix(malformed)).not.toBe(malformed)
    expect(riskRatingForAssessmentScore(16, malformed)).toBe('High')
  })

  it('supports configured 3×3 factors and aligns action priority with cell labels', () => {
    const five = riskAssessmentMatrix()
    const cells = Object.fromEntries(
      Object.entries(five.cells).filter(([key]) => {
        const [severity, likelihood] = key.split(':').map(Number)
        return severity! < 3 && likelihood! < 3
      }),
    )
    const three = {
      axes: {
        severity: { values: five.axes.severity.values.slice(0, 3) },
        likelihood: { values: five.axes.likelihood.values.slice(0, 3) },
      },
      cells,
    }
    expect(Object.keys(riskAssessmentMatrix(three).cells)).toHaveLength(9)
    expect(riskActionPriority(1, 1, three)).toBe('low')
    expect(riskActionPriority(3, 3, three)).toBe('medium')

    const unknownLabel = structuredClone(three)
    unknownLabel.cells['2:2'] = { ...unknownLabel.cells['2:2']!, label: 'Urgent' }
    expect(riskActionPriority(3, 3, unknownLabel)).toBe('high')
  })

  it('shows 4×4 as High and 5×4 as Critical, matching persisted reports', () => {
    expect(riskAssessmentMatrix().cells['3:3']?.label).toBe('High')
    expect(riskAssessmentMatrix().cells['3:4']?.label).toBe('Critical')
  })
})
