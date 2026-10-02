import 'server-only'

import { and, eq } from 'drizzle-orm'
import { bulkImportBatches, bulkImportRows } from '@beaconhs/db/schema'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { propertyStructurePreview, validatePropertyStructureRows } from './property-structure'

export type PreviewFilter = 'all' | 'valid' | 'errors' | 'warnings' | 'duplicates'

type PropertyStructurePreviewRow = {
  sourceRowNumber: number
  recordType: 'Property' | 'Building' | 'Floor' | 'Room'
  reference: string
  name: string
  proposedAction: string
  status: string
  messages: Array<{ severity: 'error' | 'warning'; message: string }>
  duplicateReference: string | null
}

function recordDetails(
  values: Record<string, unknown>,
): Pick<PropertyStructurePreviewRow, 'recordType' | 'reference' | 'name'> {
  const string = (key: string) => (typeof values[key] === 'string' ? values[key] : '')
  if (string('room_code'))
    return { recordType: 'Room', reference: string('room_code'), name: string('room_name') }
  if (string('floor_code'))
    return { recordType: 'Floor', reference: string('floor_code'), name: string('floor_name') }
  if (string('building_code'))
    return {
      recordType: 'Building',
      reference: string('building_code'),
      name: string('building_name'),
    }
  return {
    recordType: 'Property',
    reference: string('property_code'),
    name: string('property_name'),
  }
}

function matchesFilter(row: PropertyStructurePreviewRow, filter: PreviewFilter) {
  if (filter === 'all') return true
  if (filter === 'duplicates') return Boolean(row.duplicateReference)
  if (filter === 'errors') return row.messages.some((message) => message.severity === 'error')
  if (filter === 'warnings') return row.messages.some((message) => message.severity === 'warning')
  return !row.messages.some((message) => message.severity === 'error')
}

/** Read-only projection of a tenant-owned, Property Structure validation batch. */
export async function getPropertyStructurePreview(batchId: string, filter: PreviewFilter) {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  assertCan(ctx, 'hospitality.manage')
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')

  return ctx.db(async (tx) => {
    const [batch] = await tx
      .select({
        id: bulkImportBatches.id,
        datasetKey: bulkImportBatches.datasetKey,
        status: bulkImportBatches.status,
      })
      .from(bulkImportBatches)
      .where(and(eq(bulkImportBatches.id, batchId), eq(bulkImportBatches.tenantId, ctx.tenantId)))
      .limit(1)
    if (!batch || batch.datasetKey !== 'property.structure') return null

    const persisted = await tx
      .select({
        sourceRowNumber: bulkImportRows.sourceRowNumber,
        rawValues: bulkImportRows.rawValues,
        proposedAction: bulkImportRows.proposedAction,
        status: bulkImportRows.status,
        issues: bulkImportRows.issues,
        duplicateReference: bulkImportRows.duplicateReference,
      })
      .from(bulkImportRows)
      .where(and(eq(bulkImportRows.tenantId, ctx.tenantId), eq(bulkImportRows.batchId, batch.id)))
      .orderBy(bulkImportRows.sourceRowNumber)

    const rows = persisted.map((row) => ({
      sourceRowNumber: row.sourceRowNumber,
      ...recordDetails(row.rawValues),
      proposedAction: row.proposedAction,
      status: row.status,
      messages: row.issues,
      duplicateReference: row.duplicateReference,
    }))
    const all = {
      total: rows.length,
      valid: rows.filter((row) => !row.messages.some((message) => message.severity === 'error'))
        .length,
      errors: rows.filter((row) => row.messages.some((message) => message.severity === 'error'))
        .length,
      warnings: rows.filter((row) => row.messages.some((message) => message.severity === 'warning'))
        .length,
      duplicates: rows.filter((row) => row.duplicateReference).length,
    }
    const hierarchy = propertyStructurePreview(
      validatePropertyStructureRows(persisted.map((row) => row.rawValues)),
    )
    return {
      batch,
      summary: all,
      hierarchy,
      rows: rows.filter((row) => matchesFilter(row, filter)),
      eligibleForReview: all.errors === 0 && batch.status === 'ready_for_confirmation',
    }
  })
}
