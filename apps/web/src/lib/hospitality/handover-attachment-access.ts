import { and, count, eq, inArray } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { hospitalityHandoverAttachments, hospitalityHandovers } from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'

/**
 * Capability URLs prove attachment identity, not Handover property authority.
 * Discover only parent IDs with the privileged pool, then require every parent
 * to be visible through the caller's tenant/property-scoped transaction.
 */
export async function canReadHandoverAttachment(ctx: RequestContext, attachmentId: string) {
  const parentIds = await withSuperAdmin(db, async (tx) => {
    const rows = await tx
      .select({ id: hospitalityHandoverAttachments.handoverId })
      .from(hospitalityHandoverAttachments)
      .where(
        and(
          eq(hospitalityHandoverAttachments.tenantId, ctx.tenantId),
          eq(hospitalityHandoverAttachments.attachmentId, attachmentId),
        ),
      )
      .limit(1001)
    if (rows.length > 1000) return null
    return [...new Set(rows.map((row) => row.id))]
  })
  if (parentIds === null) return false
  if (!parentIds.length) return true
  return ctx.db(async (tx) => {
    const [row] = await tx
      .select({ value: count() })
      .from(hospitalityHandovers)
      .where(
        and(
          eq(hospitalityHandovers.tenantId, ctx.tenantId),
          inArray(hospitalityHandovers.id, parentIds),
        ),
      )
    return Number(row?.value) === parentIds.length
  })
}
