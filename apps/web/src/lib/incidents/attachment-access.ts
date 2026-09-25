import { and, count, eq, inArray } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { incidentAttachments, incidents } from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'

/** Capability identity plus the caller's tenant/property-scoped Incident parent is required. */
export async function canReadIncidentAttachment(ctx: RequestContext, attachmentId: string) {
  const parentIds = await withSuperAdmin(db, async (tx) => {
    const rows = await tx
      .select({ id: incidentAttachments.incidentId })
      .from(incidentAttachments)
      .where(
        and(
          eq(incidentAttachments.tenantId, ctx.tenantId),
          eq(incidentAttachments.attachmentId, attachmentId),
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
      .from(incidents)
      .where(and(eq(incidents.tenantId, ctx.tenantId), inArray(incidents.id, parentIds)))
    return Number(row?.value) === parentIds.length
  })
}
