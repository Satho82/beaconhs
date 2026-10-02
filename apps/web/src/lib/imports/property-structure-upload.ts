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
import { parseImportRows, previewImport, validateImportRows } from './engine'
import { propertyStructureImportDataset, validatePropertyStructureRows } from './property-structure'

const inputSchema = z.object({ attachmentId: z.string().uuid() })

export type PropertyStructureUploadOutcome =
  { ok: true; batchId: string } | { ok: false; error: string }

/**
 * Converts a finalized, tenant-owned CSV attachment into an immutable governed
 * batch. This deliberately stops at validation: operational records are only
 * created by the later, separately confirmed execution step.
 */
export async function validatePropertyStructureUpload(
  input: z.infer<typeof inputSchema>,
): Promise<PropertyStructureUploadOutcome> {
  const parsedInput = inputSchema.safeParse(input)
  if (!parsedInput.success) return { ok: false, error: 'The selected upload is invalid.' }

  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  assertCan(ctx, 'hospitality.manage')
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')

  const attachment = await ctx.db(async (tx) => {
    const [row] = await tx
      .select({
        id: attachments.id,
        r2Key: attachments.r2Key,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.id, parsedInput.data.attachmentId),
          eq(attachments.tenantId, ctx.tenantId),
        ),
      )
      .limit(1)
    return row
  })
  if (!attachment) return { ok: false, error: 'The selected upload could not be found.' }
  if (attachment.contentType.split(';', 1)[0]?.toLowerCase() !== 'text/csv')
    return { ok: false, error: 'Property Structure imports must be CSV files.' }
  if (attachment.sizeBytes > 5_000_000)
    return { ok: false, error: 'Import files cannot exceed 5 MB.' }

  let source: Buffer
  try {
    source = await getObject({ key: attachment.r2Key })
  } catch {
    return { ok: false, error: 'The uploaded file could not be read.' }
  }

  let rows: ReturnType<typeof parseImportRows>
  try {
    rows = parseImportRows(source.toString('utf8'), propertyStructureImportDataset)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The import file could not be parsed.',
    }
  }
  const structural = validatePropertyStructureRows(rows.map((row) => row.values))
  const validated = await validateImportRows(rows, propertyStructureImportDataset)
  const persistedRows = validated.map((row, index) => {
    const issues = [...row.issues, ...(structural[index]?.issues ?? [])]
    const rejected = issues.some((issue) => issue.severity === 'error')
    return { ...row, issues, status: rejected ? ('rejected' as const) : ('accepted' as const) }
  })
  const summary = previewImport(
    persistedRows.map(({ status: _status, ...row }) => row),
    propertyStructureImportDataset,
  )
  const sourceDigest = createHash('sha256').update(source).digest('hex')

  const batchId = await ctx.db(async (tx) => {
    const [batch] = await tx
      .insert(bulkImportBatches)
      .values({
        tenantId: ctx.tenantId,
        datasetKey: propertyStructureImportDataset.id,
        sourceAttachmentId: attachment.id,
        sourceDigest,
        status: summary.invalid ? 'parsed' : 'ready_for_confirmation',
        validationSummary: summary,
        createdByUserId: ctx.userId,
      })
      .returning({ id: bulkImportBatches.id })
    if (!batch) throw new Error('Import batch creation failed.')
    if (persistedRows.length) {
      await tx.insert(bulkImportRows).values(
        persistedRows.map((row) => ({
          tenantId: ctx.tenantId,
          batchId: batch.id,
          sourceRowNumber: row.sourceRowNumber,
          rawValues: row.values,
          mappedValues: row.mapped ?? {},
          issues: row.issues,
          duplicateReference: row.duplicateReference ?? null,
          proposedAction: row.proposedAction,
          status: row.status,
        })),
      )
    }
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'bulk_import_batch',
      entityId: batch.id,
      action: 'create',
      summary: 'Uploaded and validated Property Structure import',
      after: { datasetKey: propertyStructureImportDataset.id, ...summary },
      metadata: { sourceAttachmentId: attachment.id, sourceDigest },
    })
    return batch.id
  })

  return { ok: true, batchId }
}
