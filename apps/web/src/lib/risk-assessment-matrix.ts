import { riskRating, riskScore } from '@beaconhs/db/risk-matrix'
export type RiskMatrixConfig = {
  axes: { severity: { values: string[] }; likelihood: { values: string[] } }
  cells: Record<string, { score: number; label: string; color: string }>
}

function isUsableMatrix(value: RiskMatrixConfig | null | undefined): value is RiskMatrixConfig {
  if (!value || !value.axes?.severity?.values || !value.axes?.likelihood?.values || !value.cells)
    return false
  const severityCount = value.axes.severity.values.length
  const likelihoodCount = value.axes.likelihood.values.length
  if (severityCount < 3 || severityCount > 5 || likelihoodCount < 3 || likelihoodCount > 5)
    return false
  for (let severity = 1; severity <= severityCount; severity++) {
    for (let likelihood = 1; likelihood <= likelihoodCount; likelihood++) {
      const cell = value.cells[`${severity - 1}:${likelihood - 1}`]
      if (
        !cell ||
        cell.score !== riskScore(likelihood, severity) ||
        !cell.label.trim() ||
        !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(cell.color)
      )
        return false
    }
  }
  return true
}

/** Resolve one canonical tenant matrix, falling back to the established product bands. */
export function riskAssessmentMatrix(config?: RiskMatrixConfig | null): RiskMatrixConfig {
  if (isUsableMatrix(config)) return config
  const colors = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#dc2626' }
  const cells: RiskMatrixConfig['cells'] = {}
  for (let severity = 1; severity <= 5; severity++) {
    for (let likelihood = 1; likelihood <= 5; likelihood++) {
      const score = riskScore(likelihood, severity)
      const label = riskRating(score)
      cells[`${severity - 1}:${likelihood - 1}`] = {
        score,
        label,
        color: colors[label as keyof typeof colors] ?? '#94a3b8',
      }
    }
  }
  return {
    axes: {
      severity: { values: ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe'] },
      likelihood: { values: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'] },
    },
    cells,
  }
}

export function riskRatingForAssessmentScore(
  score: number,
  config?: RiskMatrixConfig | null,
): string {
  const matrix = riskAssessmentMatrix(config)
  const cell = Object.values(matrix.cells).find((candidate) => candidate.score === score)
  return cell?.label ?? 'Unrated'
}

export function riskRatingAt(
  likelihood: number,
  severity: number,
  config?: RiskMatrixConfig | null,
): string {
  const matrix = riskAssessmentMatrix(config)
  return matrix.cells[`${severity - 1}:${likelihood - 1}`]?.label ?? 'Unrated'
}

export function isHighOrCriticalRiskScore(
  score: number,
  config?: RiskMatrixConfig | null,
): boolean {
  return /high|critical/i.test(riskRatingForAssessmentScore(score, config))
}

export function riskActionPriority(
  likelihood: number,
  severity: number,
  config?: RiskMatrixConfig | null,
): 'low' | 'medium' | 'high' | 'critical' {
  const rating = riskRatingAt(likelihood, severity, config).toLowerCase()
  if (rating === 'low' || rating === 'medium' || rating === 'high' || rating === 'critical')
    return rating
  return 'high'
}
