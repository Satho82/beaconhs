'use server'

import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { attachments, bulkImportBatches, bulkImportRows } from '@beaconhs/db/schema'
import { getObject } from '@beaconhs/storage'
import { assertCan } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { executePropertyStructureBatch } from './property-structure-execution'
import { propertyStructurePreview, validatePropertyStructureRows } from './property-structure'

const inputSchema = z.object({ batchId: z.string().uuid(), acknowledged: z.literal(true) })

async function requireImportAuthority() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  assertCan(ctx, 'hospitality.manage')
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  return ctx
}

export async function getPropertyStructureReview(batchId: string) {
  const ctx = await requireImportAuthority()
  return ctx.db(async (tx) => {
    const [batch] = await tx
      .select({
        id: bulkImportBatches.id,
        datasetKey: bulkImportBatches.datasetKey,
        status: bulkImportBatches.status,
        validationSummary: bulkImportBatches.validationSummary,
        sourceDigest: bulkImportBatches.sourceDigest,
        createdAt: bulkImportBatches.createdAt,
        sourceFilename: attachments.filename,
      })
      .from(bulkImportBatches)
      .leftJoin(
        attachments,
        and(
          eq(attachments.id, bulkImportBatches.sourceAttachmentId),
          eq(attachments.tenantId, bulkImportBatches.tenantId),
        ),
      )
      .where(and(eq(bulkImportBatches.id, batchId), eq(bulkImportBatches.tenantId, ctx.tenantId)))
      .limit(1)
    if (!batch || batch.datasetKey !== 'property.structure') return null
    const rows = await tx
      .select({
        rawValues: bulkImportRows.rawValues,
        issues: bulkImportRows.issues,
        duplicateReference: bulkImportRows.duplicateReference,
      })
      .from(bulkImportRows)
      .where(and(eq(bulkImportRows.tenantId, ctx.tenantId), eq(bulkImportRows.batchId, batch.id)))
    const summary = {
      total: rows.length,
      valid: rows.filter((row) => !row.issues.some((issue) => issue.severity === 'error')).length,
      errors: rows.filter((row) => row.issues.some((issue) => issue.severity === 'error')).length,
      warnings: rows.filter((row) => row.issues.some((issue) => issue.severity === 'warning'))
        .length,
      duplicates: rows.filter((row) => row.duplicateReference).length,
    }
    return {
      batch,
      summary,
      hierarchy: propertyStructurePreview(
        validatePropertyStructureRows(rows.map((row) => row.rawValues)),
      ),
      eligible: batch.status === 'ready_for_confirmation' && summary.errors === 0,
    }
  })
}

export async function confirmPropertyStructureImport(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Confirmation is required.' }
  const ctx = await requireImportAuthority()
  let executionWasAuthorized = false
  try {
    await ctx.db(async (tx) => {
      const [batch] = await tx
        .select({
          id: bulkImportBatches.id,
          status: bulkImportBatches.status,
          datasetKey: bulkImportBatches.datasetKey,
          sourceDigest: bulkImportBatches.sourceDigest,
          sourceAttachmentId: bulkImportBatches.sourceAttachmentId,
        })
        .from(bulkImportBatches)
        .where(
          and(
            eq(bulkImportBatches.id, parsed.data.batchId),
            eq(bulkImportBatches.tenantId, ctx.tenantId),
          ),
        )
        .for('update')
        .limit(1)
      if (
        !batch ||
        batch.datasetKey !== 'property.structure' ||
        batch.status !== 'ready_for_confirmation' ||
        !batch.sourceAttachmentId
      )
        throw new Error('This import is no longer eligible for confirmation.')
      const rows = await tx
        .select({ issues: bulkImportRows.issues })
        .from(bulkImportRows)
        .where(and(eq(bulkImportRows.tenantId, ctx.tenantId), eq(bulkImportRows.batchId, batch.id)))
      if (rows.some((row) => row.issues.some((issue) => issue.severity === 'error')))
        throw new Error('This import has validation errors.')
      const [source] = await tx
        .select({ r2Key: attachments.r2Key })
        .from(attachments)
        .where(
          and(eq(attachments.id, batch.sourceAttachmentId), eq(attachments.tenantId, ctx.tenantId)),
        )
        .limit(1)
      if (!source) throw new Error('The validated source is no longer available.')
      const bytes = await getObject({ key: source.r2Key })
      if (createHash('sha256').update(bytes).digest('hex') !== batch.sourceDigest)
        throw new Error('The validated source has changed.')
      await tx
        .update(bulkImportBatches)
        .set({ confirmedByUserId: ctx.userId, confirmedAt: new Date() })
        .where(eq(bulkImportBatches.id, batch.id))
      await recordAuditInTransaction(tx, ctx, {
        entityType: 'bulk_import_batch',
        entityId: batch.id,
        action: 'update',
        summary: 'Confirmed Property Structure import for execution',
      })
    })
    executionWasAuthorized = true
    await executePropertyStructureBatch(ctx, parsed.data.batchId)
    return { ok: true as const }
  } catch {
    if (executionWasAuthorized) {
      await ctx.db(async (tx) => {
        const [failed] = await tx
          .update(bulkImportBatches)
          .set({
            status: 'failed',
            failureReason: 'Execution failed. No operational records were committed.',
          })
          .where(
            and(
              eq(bulkImportBatches.id, parsed.data.batchId),
              eq(bulkImportBatches.tenantId, ctx.tenantId),
              eq(bulkImportBatches.status, 'ready_for_confirmation'),
            ),
          )
          .returning({ id: bulkImportBatches.id })
        if (failed) {
          await recordAuditInTransaction(tx, ctx, {
            entityType: 'bulk_import_batch',
            entityId: failed.id,
            action: 'update',
            summary:
              'Property Structure import execution failed without committed operational records',
          })
        }
      })
    }
    return {
      ok: false as const,
      error: 'The import could not be confirmed. Refresh and review its current status.',
    }
  }
}
