'use server'

import { createHash } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { attachments, bulkImportBatches, bulkImportRows, equipmentItems } from '@beaconhs/db/schema'
import { getObject } from '@beaconhs/storage'
import { assertCan } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { requireRequestContext } from '@/lib/auth'
import { parseImportRows, previewImport, validateImportRows } from './engine'
import { assetImportBatchIssues, assetImportDataset } from './assets-import'

const inputSchema = z.object({ attachmentId: z.string().uuid() })

export async function validateAssetImportUpload(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'The selected upload is invalid.' }

  const ctx = await requireRequestContext()
  assertCan(ctx, 'equipment.manage')

  const attachment = await ctx.db(async (tx) => {
    const [row] = await tx.select({
      id: attachments.id, r2Key: attachments.r2Key, contentType: attachments.contentType, sizeBytes: attachments.sizeBytes,
    }).from(attachments).where(and(eq(attachments.id, parsed.data.attachmentId), eq(attachments.tenantId, ctx.tenantId))).limit(1)
    return row
  })
  if (!attachment) return { ok: false as const, error: 'The selected upload could not be found.' }
  if (attachment.contentType.split(';', 1)[0]?.toLowerCase() !== 'text/csv')
    return { ok: false as const, error: 'Assets imports must be CSV files.' }
  if (attachment.sizeBytes > 5_000_000) return { ok: false as const, error: 'Import files cannot exceed 5 MB.' }

  let source: Buffer
  try { source = await getObject({ key: attachment.r2Key }) } catch { return { ok: false as const, error: 'The uploaded file could not be read.' } }

  try {
    const rows = parseImportRows(source.toString('utf8'), assetImportDataset)
    const tags = rows.map((row) => row.values.asset_tag?.trim()).filter((tag): tag is string => Boolean(tag))
    const existingTags = await ctx.db(async (tx) => new Set((await tx.select({ assetTag: equipmentItems.assetTag })
      .from(equipmentItems).where(and(eq(equipmentItems.tenantId, ctx.tenantId), inArray(equipmentItems.assetTag, tags)))).map((row) => row.assetTag.toLowerCase())))
    const validated = await validateImportRows(rows, {
      ...assetImportDataset,
      duplicate: async (row) => existingTags.has(row.asset_tag.toLowerCase()) ? row.asset_tag : null,
    })
    const structural = assetImportBatchIssues(validated.map((row) => row.mapped!))
    const persistedRows = validated.map((row, index) => {
      const issues = [...row.issues, ...structural[index]!]
      return { ...row, issues, status: issues.some((issue) => issue.severity === 'error') ? ('rejected' as const) : ('accepted' as const) }
    })
    const summary = previewImport(persistedRows.map(({ status: _status, ...row }) => row), assetImportDataset)
    const sourceDigest = createHash('sha256').update(source).digest('hex')
    const batchId = await ctx.db(async (tx) => {
      const [batch] = await tx.insert(bulkImportBatches).values({
        tenantId: ctx.tenantId, datasetKey: assetImportDataset.id, sourceAttachmentId: attachment.id, sourceDigest,
        status: summary.invalid ? 'parsed' : 'ready_for_confirmation', validationSummary: summary, createdByUserId: ctx.userId,
      }).returning({ id: bulkImportBatches.id })
      if (!batch) throw new Error('Import batch creation failed.')
      if (persistedRows.length) await tx.insert(bulkImportRows).values(persistedRows.map((row) => ({
        tenantId: ctx.tenantId, batchId: batch.id, sourceRowNumber: row.sourceRowNumber, rawValues: row.values,
        mappedValues: row.mapped ?? {}, issues: row.issues, duplicateReference: row.duplicateReference ?? null,
        proposedAction: row.proposedAction, status: row.status,
      })))
      await recordAuditInTransaction(tx, ctx, { entityType: 'bulk_import_batch', entityId: batch.id, action: 'create',
        summary: 'Uploaded and validated Assets import', after: { datasetKey: assetImportDataset.id, ...summary },
        metadata: { sourceAttachmentId: attachment.id, sourceDigest } })
      return batch.id
    })
    return { ok: true as const, batchId }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'The import file could not be parsed.' }
  }
}