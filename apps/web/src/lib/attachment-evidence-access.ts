import type { RequestContext } from '@beaconhs/tenant'
import { isUuid } from './list-params'
import { canReadActionAttachment } from './action-attachment-access'
import { canReadIncidentAttachment } from './incidents/attachment-access'
import { canReadHandoverAttachment } from './hospitality/handover-attachment-access'
import { canReadMaintenanceAttachment } from './hospitality/maintenance-attachment-access'
import { canReadInspectionComplianceAttachment } from './inspection-compliance-attachment-access'

/** Linking or changing shared evidence requires access to every existing parent. */
export async function canReadEvidenceAttachment(ctx: RequestContext, attachmentId: string) {
  return (
    isUuid(attachmentId) &&
    (await canReadActionAttachment(ctx, attachmentId)) &&
    (await canReadIncidentAttachment(ctx, attachmentId)) &&
    (await canReadHandoverAttachment(ctx, attachmentId)) &&
    (await canReadMaintenanceAttachment(ctx, attachmentId)) &&
    (await canReadInspectionComplianceAttachment(ctx, attachmentId))
  )
}

export async function assertCanUseEvidenceAttachments(
  ctx: RequestContext,
  attachmentIds: readonly string[],
) {
  for (const attachmentId of new Set(attachmentIds)) {
    if (!(await canReadEvidenceAttachment(ctx, attachmentId))) {
      throw new Error('Attachment is not available in your property scope.')
    }
  }
}
