type RiskRating = 'Low' | 'Medium' | 'High' | 'Critical'
import type { RiskMatrixSnapshot } from './schema/risk'

export function canonicalRiskMatrixSnapshot(): RiskMatrixSnapshot {
  const colors = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#dc2626' }
  const cells: RiskMatrixSnapshot['cells'] = {}
  for (let s = 1; s <= 5; s++)
    for (let l = 1; l <= 5; l++) {
      const score = s * l,
        label = riskRating(score)
      cells[`${s - 1}:${l - 1}`] = { score, label, color: colors[label] }
    }
  return {
    schemaVersion: 1,
    modelKey: 'uvanoo-5x5-v1',
    size: 5,
    axes: {
      severity: { values: ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe'] },
      likelihood: { values: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'] },
    },
    cells,
  }
}
type RiskFactor = 1 | 2 | 3 | 4 | 5

function assertRiskFactor(value: number): asserts value is RiskFactor {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new RangeError('Risk likelihood and severity must be integers from 1 to 5')
  }
}

export function riskScore(likelihood: number, severity: number) {
  assertRiskFactor(likelihood)
  assertRiskFactor(severity)
  return likelihood * severity
}

export function riskRating(score: number): RiskRating {
  if (!Number.isInteger(score) || score < 1 || score > 25) {
    throw new RangeError('Risk score must be an integer from 1 to 25')
  }
  if (score <= 4) return 'Low'
  if (score <= 9) return 'Medium'
  if (score <= 16) return 'High'
  return 'Critical'
}

export function calculateRisk(likelihood: number, severity: number) {
  const score = riskScore(likelihood, severity)
  return {
    likelihood: likelihood as RiskFactor,
    severity: severity as RiskFactor,
    score,
    rating: riskRating(score),
  }
}
