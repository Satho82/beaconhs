import 'server-only'

import { and, eq } from 'drizzle-orm'
import { bulkImportBatches, bulkImportRows } from '@beaconhs/db/schema'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'

async function requireResultAuthority() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  assertCan(ctx, 'hospitality.read')
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  return ctx
}

export async function getPropertyStructureResult(batchId: string) {
  const ctx = await requireResultAuthority()
  return ctx.db(async (tx) => {
    const [batch] = await tx
      .select({
        id: bulkImportBatches.id,
        datasetKey: bulkImportBatches.datasetKey,
        status: bulkImportBatches.status,
        result: bulkImportBatches.result,
        failureReason: bulkImportBatches.failureReason,
        completedAt: bulkImportBatches.completedAt,
      })
      .from(bulkImportBatches)
      .where(and(eq(bulkImportBatches.id, batchId), eq(bulkImportBatches.tenantId, ctx.tenantId)))
      .limit(1)
    if (
      !batch ||
      batch.datasetKey !== 'property.structure' ||
      (batch.status !== 'completed' && batch.status !== 'failed')
    )
      return null
    const rows = await tx
      .select({
        sourceRowNumber: bulkImportRows.sourceRowNumber,
        proposedAction: bulkImportRows.proposedAction,
        finalAction: bulkImportRows.finalAction,
        status: bulkImportRows.status,
        issues: bulkImportRows.issues,
        duplicateReference: bulkImportRows.duplicateReference,
      })
      .from(bulkImportRows)
      .where(and(eq(bulkImportRows.tenantId, ctx.tenantId), eq(bulkImportRows.batchId, batch.id)))
      .orderBy(bulkImportRows.sourceRowNumber)
    const result = batch.result ?? {}
    const number = (key: string) => (typeof result[key] === 'number' ? result[key] : 0)
    return {
      batch,
      rows,
      metrics: {
        created: number('created'),
        updated: number('updated'),
        rejected: number('rejected'),
        warnings: rows.filter((row) => row.issues.some((issue) => issue.severity === 'warning'))
          .length,
        duplicates: number('duplicate'),
        skipped: number('skipped'),
        failed: number('failed'),
      },
    }
  })
}
