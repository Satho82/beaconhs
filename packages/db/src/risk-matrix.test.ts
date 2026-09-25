import { describe, expect, it } from 'vitest'
import { calculateRisk, riskRating, riskScore } from './risk-matrix'

describe('5x5 risk matrix', () => {
  it('calculates every valid likelihood/severity combination', () => {
    for (let likelihood = 1; likelihood <= 5; likelihood += 1) {
      for (let severity = 1; severity <= 5; severity += 1) {
        expect(calculateRisk(likelihood, severity).score).toBe(likelihood * severity)
      }
    }
  })
  it.each([
    [1, 'Low'],
    [4, 'Low'],
    [5, 'Medium'],
    [9, 'Medium'],
    [10, 'High'],
    [16, 'High'],
    [17, 'Critical'],
    [25, 'Critical'],
  ] as const)('maps score %i to %s', (score, rating) => expect(riskRating(score)).toBe(rating))
  it.each([
    [0, 1],
    [6, 1],
    [1, 0],
    [1, 6],
    [1.5, 2],
  ])('rejects invalid factors', (likelihood, severity) =>
    expect(() => riskScore(likelihood, severity)).toThrow(/1 to 5/),
  )
})
