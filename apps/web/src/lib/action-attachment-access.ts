import { and, count, eq, inArray } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { caCompleteSteps, caPhotos, correctiveActions, reportRuns } from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'

/**
 * Capability URLs establish attachment identity, not property authorization.
 * The privileged lookup discovers only parent IDs inside the active tenant:
 * using ordinary RLS here would hide forbidden links and misclassify an
 * attachment as unlinked. Content is never returned by that lookup.
 * Every parent must then be visible through the caller's scoped transaction.
 */
export async function canReadActionAttachment(ctx: RequestContext, attachmentId: string) {
  const ids = await withSuperAdmin(db, async (tx) => {
    const photos = await tx
      .select({ id: caPhotos.caId })
      .from(caPhotos)
      .where(and(eq(caPhotos.tenantId, ctx.tenantId), eq(caPhotos.attachmentId, attachmentId)))
      .limit(1001)
    const signatures = await tx
      .select({ id: caCompleteSteps.caId })
      .from(caCompleteSteps)
      .where(
        and(
          eq(caCompleteSteps.tenantId, ctx.tenantId),
          eq(caCompleteSteps.signatureAttachmentId, attachmentId),
        ),
      )
      .limit(1001)
    const reports = await tx
      .select({ id: reportRuns.id })
      .from(reportRuns)
      .where(
        and(eq(reportRuns.tenantId, ctx.tenantId), eq(reportRuns.pdfAttachmentId, attachmentId)),
      )
      .limit(1001)
    if (photos.length > 1000 || signatures.length > 1000 || reports.length > 1000) return null
    return {
      actions: [...new Set([...photos, ...signatures].map((row) => row.id))],
      reports: reports.map((row) => row.id),
    }
  })
  if (ids === null) return false
  if (ids.actions.length === 0 && ids.reports.length === 0) return true
  return ctx.db(async (tx) => {
    if (ids.actions.length > 0) {
      const [row] = await tx
        .select({ value: count() })
        .from(correctiveActions)
        .where(
          and(
            eq(correctiveActions.tenantId, ctx.tenantId),
            inArray(correctiveActions.id, ids.actions),
          ),
        )
      if (Number(row?.value) !== ids.actions.length) return false
    }
    if (ids.reports.length > 0) {
      const [row] = await tx
        .select({ value: count() })
        .from(reportRuns)
        .where(and(eq(reportRuns.tenantId, ctx.tenantId), inArray(reportRuns.id, ids.reports)))
      if (Number(row?.value) !== ids.reports.length) return false
    }
    return true
  })
}
