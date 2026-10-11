import { sql } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import {
  riskAssessmentVersions,
  type RiskAssessmentSignoffSnapshot,
  type RiskMatrixSnapshot,
} from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'
import { riskAssessmentMatrix, type RiskMatrixConfig } from './risk-assessment-matrix'

const colors: Record<string, string> = {
  Low: '#10b981',
  Medium: '#f59e0b',
  High: '#f97316',
  Critical: '#dc2626',
}
export function validateRiskMatrixSnapshot(value: unknown): RiskMatrixSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Select a valid risk matrix')
  const matrix = value as RiskMatrixSnapshot
  const exactKeys = (object: object, keys: string[]) =>
    Object.keys(object).sort().join(',') === keys.sort().join(',')
  if (
    !exactKeys(matrix, ['schemaVersion', 'modelKey', 'size', 'axes', 'cells']) ||
    matrix.schemaVersion !== 1 ||
    ![3, 5].includes(matrix.size) ||
    matrix.modelKey !== `uvanoo-${matrix.size}x${matrix.size}-v1` ||
    !matrix.axes ||
    !exactKeys(matrix.axes, ['severity', 'likelihood']) ||
    !matrix.cells ||
    Object.keys(matrix.cells).length !== matrix.size * matrix.size
  )
    throw new Error('Invalid risk matrix snapshot')
  for (const axis of [matrix.axes.severity, matrix.axes.likelihood]) {
    if (
      !axis ||
      !exactKeys(axis, ['values']) ||
      !Array.isArray(axis.values) ||
      axis.values.length !== matrix.size ||
      axis.values.some((label) => typeof label !== 'string' || !label.trim() || label.length > 100)
    )
      throw new Error('Invalid matrix axis')
  }
  for (let s = 1; s <= matrix.size; s++)
    for (let l = 1; l <= matrix.size; l++) {
      const cell = matrix.cells[`${s - 1}:${l - 1}`]
      if (
        !cell ||
        !exactKeys(cell, ['score', 'label', 'color']) ||
        cell.score !== s * l ||
        !colors[cell.label] ||
        cell.color !== colors[cell.label]
      )
        throw new Error('Invalid matrix cell')
    }
  return structuredClone(matrix)
}

export function captureRiskMatrix(config?: RiskMatrixConfig | null): RiskMatrixSnapshot {
  const matrix = riskAssessmentMatrix(config)
  const size = matrix.axes.severity.values.length
  return validateRiskMatrixSnapshot({
    schemaVersion: 1,
    modelKey: `uvanoo-${size}x${size}-v1`,
    size,
    ...matrix,
  })
}

export async function writeRiskRevision(
  tx: Database,
  ctx: RequestContext,
  assessment: { id: string; contentRevision: number },
  event: Exclude<typeof riskAssessmentVersions.$inferInsert.event, 'baseline'>,
  reason?: string,
  report?: RiskAssessmentSignoffSnapshot,
) {
  const actor = ctx.membership?.id
  if (!actor || actor === 'super-admin') throw new Error('A tenant membership is required')
  const rows = await tx.execute(
    sql`select public.risk_capture_content(${ctx.tenantId}::uuid,${assessment.id}::uuid) as content`,
  )
  const content = rows[0]?.content as Record<string, unknown> | undefined
  if (!content) throw new Error('Cannot capture assessment revision')
  const snapshot = {
    ...content,
    schemaVersion: 2,
    tenantId: ctx.tenantId,
    assessmentId: assessment.id,
    contentRevision: assessment.contentRevision,
    provenance: { kind: 'application_revision', capturedAt: new Date().toISOString() },
    ...(report ? { report } : {}),
  }
  await tx.insert(riskAssessmentVersions).values({
    tenantId: ctx.tenantId,
    assessmentId: assessment.id,
    revision: assessment.contentRevision,
    actorTenantUserId: actor,
    event,
    reason: reason ?? null,
    snapshot,
  })
  return snapshot
}
