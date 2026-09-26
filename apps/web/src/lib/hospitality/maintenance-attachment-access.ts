import { and, count, eq, inArray } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { maintenanceIssueAttachments, maintenanceIssues } from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'

/** A capability URL never substitutes for tenant/property-scoped issue visibility. */
export async function canReadMaintenanceAttachment(ctx: RequestContext, attachmentId: string) {
  const parentIds = await withSuperAdmin(db, async (tx) => {
    const rows = await tx
      .select({ id: maintenanceIssueAttachments.issueId })
      .from(maintenanceIssueAttachments)
      .where(
        and(
          eq(maintenanceIssueAttachments.tenantId, ctx.tenantId),
          eq(maintenanceIssueAttachments.attachmentId, attachmentId),
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
      .from(maintenanceIssues)
      .where(
        and(eq(maintenanceIssues.tenantId, ctx.tenantId), inArray(maintenanceIssues.id, parentIds)),
      )
    return Number(row?.value) === parentIds.length
  })
}
