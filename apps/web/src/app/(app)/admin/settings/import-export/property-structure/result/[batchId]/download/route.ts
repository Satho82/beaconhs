import { csvResponse } from '@/lib/csv'
import { getPropertyStructureResult } from '@/lib/imports/property-structure-result'
import { isUuid } from '@/lib/list-params'

export async function GET(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  if (!isUuid(batchId)) return new Response('Not found', { status: 404 })
  const result = await getPropertyStructureResult(batchId)
  if (!result) return new Response('Not found', { status: 404 })
  return csvResponse({
    filename: `property-structure-import-${result.batch.id}.csv`,
    headers: [
      'Source row',
      'Status',
      'Proposed action',
      'Final action',
      'Messages',
      'Duplicate reference',
    ],
    rows: result.rows.map((row) => [
      row.sourceRowNumber,
      row.status,
      row.proposedAction,
      row.finalAction,
      row.issues.map((issue) => `${issue.severity}: ${issue.message}`).join(' | '),
      row.duplicateReference,
    ]),
  })
}
