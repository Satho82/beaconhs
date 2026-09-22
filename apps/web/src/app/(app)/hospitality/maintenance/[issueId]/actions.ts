'use server'

import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import {
  attachMaintenanceEvidence,
  type MaintenanceEvidenceStage,
} from '@/lib/hospitality/maintenance'

export async function attachMaintenanceEvidenceAction(
  issueId: string,
  stage: MaintenanceEvidenceStage,
  attachmentIds: string[],
) {
  const ctx = await requireRequestContext()
  await attachMaintenanceEvidence(ctx, issueId, stage, attachmentIds)
  revalidatePath(`/hospitality/maintenance/${issueId}`)
}
