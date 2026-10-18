'use server'

import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  attachments,
  bulkImportBatches,
  bulkImportRows,
  equipmentCategories,
  equipmentItems,
  equipmentTypes,
  orgUnits,
} from '@beaconhs/db/schema'
import { getObject } from '@beaconhs/storage'
import { assertCan } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { requireRequestContext } from '@/lib/auth'
import type { AssetImportRow } from './assets-import'

const inputSchema = z.object({ batchId: z.string().uuid(), acknowledged: z.literal(true) })

export async function getAssetImportReview(batchId: string) {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'equipment.manage')
  return ctx.db(async (tx) => {
    const [batch] = await tx
      .select()
      .from(bulkImportBatches)
      .where(and(eq(bulkImportBatches.id, batchId), eq(bulkImportBatches.tenantId, ctx.tenantId)))
      .limit(1)
    if (!batch || batch.datasetKey !== 'equipment.assets') return null
    const rows = await tx
      .select()
      .from(bulkImportRows)
      .where(and(eq(bulkImportRows.tenantId, ctx.tenantId), eq(bulkImportRows.batchId, batch.id)))
      .orderBy(bulkImportRows.sourceRowNumber)
    const errors = rows.filter((row) =>
      row.issues.some((issue) => issue.severity === 'error'),
    ).length
    return {
      batch,
      rows,
      errors,
      eligible: batch.status === 'ready_for_confirmation' && errors === 0,
    }
  })
}

export async function confirmAssetImport(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'Confirmation is required.' }
  const ctx = await requireRequestContext()
  assertCan(ctx, 'equipment.manage')

  try {
    const result = await ctx.db(async (tx) => {
      const [batch] = await tx
        .select()
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
        batch.datasetKey !== 'equipment.assets' ||
        batch.status !== 'ready_for_confirmation' ||
        !batch.sourceAttachmentId
      )
        throw new Error('This import is no longer eligible for confirmation.')
      const [source] = await tx
        .select({ r2Key: attachments.r2Key })
        .from(attachments)
        .where(
          and(eq(attachments.id, batch.sourceAttachmentId), eq(attachments.tenantId, ctx.tenantId)),
        )
        .limit(1)
      if (
        !source ||
        createHash('sha256')
          .update(await getObject({ key: source.r2Key }))
          .digest('hex') !== batch.sourceDigest
      )
        throw new Error('The validated source is no longer available or has changed.')
      const rows = await tx
        .select()
        .from(bulkImportRows)
        .where(and(eq(bulkImportRows.tenantId, ctx.tenantId), eq(bulkImportRows.batchId, batch.id)))
        .orderBy(bulkImportRows.sourceRowNumber)
      if (rows.some((row) => row.status === 'rejected'))
        throw new Error('This import has validation errors.')
      await tx
        .update(bulkImportBatches)
        .set({
          status: 'processing',
          processingAt: new Date(),
          confirmedAt: new Date(),
          confirmedByUserId: ctx.userId,
        })
        .where(eq(bulkImportBatches.id, batch.id))
      let created = 0
      let skipped = 0
      for (const persisted of rows) {
        if (persisted.proposedAction !== 'create') {
          skipped++
          continue
        }
        const row = persisted.mappedValues as AssetImportRow
        const [category] = row.category
          ? await tx
              .select({ id: equipmentCategories.id })
              .from(equipmentCategories)
              .where(
                and(
                  eq(equipmentCategories.tenantId, ctx.tenantId),
                  eq(equipmentCategories.name, row.category),
                ),
              )
              .limit(1)
          : []
        const [type] = row.type
          ? await tx
              .select({ id: equipmentTypes.id })
              .from(equipmentTypes)
              .where(
                and(eq(equipmentTypes.tenantId, ctx.tenantId), eq(equipmentTypes.name, row.type)),
              )
              .limit(1)
          : []
        const [site] = row.site
          ? await tx
              .select({ id: orgUnits.id })
              .from(orgUnits)
              .where(and(eq(orgUnits.tenantId, ctx.tenantId), eq(orgUnits.name, row.site)))
              .limit(1)
          : []
        await tx.insert(equipmentItems).values({
          tenantId: ctx.tenantId,
          assetTag: row.asset_tag,
          name: row.name,
          categoryId: category?.id,
          typeId: type?.id,
          currentSiteOrgUnitId: site?.id,
          status: (row.status || 'in_service') as any,
          serialNumber: row.serial_number || null,
          manufacturer: row.manufacturer || null,
          model: row.model || null,
          purchaseDate: row.purchase_date || null,
          qrToken: randomBytes(12).toString('base64url'),
        })
        created++
      }
      const result = { created, skipped, duplicate: skipped, rejected: 0, failed: 0 }
      await tx
        .update(bulkImportBatches)
        .set({ status: 'completed', completedAt: new Date(), result })
        .where(eq(bulkImportBatches.id, batch.id))
      await recordAuditInTransaction(tx, ctx, {
        entityType: 'bulk_import_batch',
        entityId: batch.id,
        action: 'create',
        summary: 'Completed Assets import',
        after: result,
      })
      return result
    })
    return { ok: true as const, result }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'The import could not be confirmed.',
    }
  }
}
