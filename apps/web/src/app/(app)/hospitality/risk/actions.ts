'use server'

import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import { requireUuidInput } from '@/lib/mutation-input'
import { requireRiskSchemaReady } from '@/lib/risk-schema-readiness'
import {
  saveTenantRiskTemplate,
  editRiskTemplateDraft,
  publishRiskTemplateDraft,
  createNextRiskTemplateDraft,
  type EditRiskTemplateDraftInput,
  type SaveTenantRiskTemplateInput,
} from '@/lib/risk-tenant-templates'
import { applyRiskLifecycleAction, type RiskLifecycleAction } from '@/lib/risk-lifecycle'
import {
  adoptRiskAssessment,
  createManualRiskAssessment,
  setRiskHazardArchived,
  selectRiskAssessmentMatrix,
  type ManualRiskAssessmentInput,
  createRiskCorrectiveAction,
  updateRiskAssessment,
  type AdoptRiskAssessmentInput,
  type CreateRiskCorrectiveActionInput,
  type UpdateRiskAssessmentInput,
} from '@/lib/risk-assessments'

export async function adoptRiskAssessmentAction(input: AdoptRiskAssessmentInput) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const result = await adoptRiskAssessment(ctx, {
    ...input,
    templateId: requireUuidInput(input.templateId, 'templateId'),
    propertyId: requireUuidInput(input.propertyId, 'propertyId'),
    assessorTenantUserId: input.assessorTenantUserId
      ? requireUuidInput(input.assessorTenantUserId, 'assessorTenantUserId')
      : undefined,
    responsibleTenantUserId: input.responsibleTenantUserId
      ? requireUuidInput(input.responsibleTenantUserId, 'responsibleTenantUserId')
      : null,
  })
  revalidatePath('/hospitality/risk')
  return { ok: true as const, assessmentId: result.assessment.id }
}

export async function saveTenantRiskTemplateAction(input: SaveTenantRiskTemplateInput) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const template = await saveTenantRiskTemplate(ctx, {
    ...input,
    source: { ...input.source, id: requireUuidInput(input.source.id, 'sourceId') },
  })
  revalidatePath('/hospitality/risk')
  return { ok: true as const, templateId: template.id }
}

export async function saveRiskAssessmentAction(
  assessmentId: string,
  input: UpdateRiskAssessmentInput,
) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const id = requireUuidInput(assessmentId, 'assessmentId')
  const result = await updateRiskAssessment(ctx, id, {
    ...input,
    assessorTenantUserId: requireUuidInput(input.assessorTenantUserId, 'assessorTenantUserId'),
    responsibleTenantUserId: input.responsibleTenantUserId
      ? requireUuidInput(input.responsibleTenantUserId, 'responsibleTenantUserId')
      : null,
    hazards: input.hazards.map((hazard) => ({
      ...hazard,
      id: hazard.id === undefined ? undefined : requireUuidInput(hazard.id, 'hazardId'),
    })),
  })
  revalidatePath('/hospitality/risk')
  revalidatePath(`/hospitality/risk/assessments/${id}`)
  revalidatePath('/hospitality/risk/review-schedule')
  return {
    ok: true as const,
    hazards: result.hazards,
    contentRevision: result.assessment.contentRevision,
  }
}

export async function createRiskCorrectiveActionAction(
  assessmentId: string,
  input: CreateRiskCorrectiveActionInput,
) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const id = requireUuidInput(assessmentId, 'assessmentId')
  const action = await createRiskCorrectiveAction(ctx, id, {
    ...input,
    hazardId: requireUuidInput(input.hazardId, 'hazardId'),
    ownerTenantUserId: requireUuidInput(input.ownerTenantUserId, 'ownerTenantUserId'),
  })
  revalidatePath(`/hospitality/risk/assessments/${id}`)
  revalidatePath('/corrective-actions')
  return { ok: true as const, correctiveActionId: action.id }
}

export async function applyRiskLifecycleActionRequest(
  assessmentId: string,
  input: {
    action: RiskLifecycleAction
    expectedRevision: number
    effectiveDate: string
    validityMonths?: number | null
    customReviewDate?: string | null
    reminderLeadDays: number
    comments?: string
  },
) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const id = requireUuidInput(assessmentId, 'assessmentId')
  await applyRiskLifecycleAction(ctx, id, input)
  revalidatePath('/hospitality/risk')
  revalidatePath('/hospitality/risk/review-schedule')
  revalidatePath(`/hospitality/risk/assessments/${id}`)
  return { ok: true as const }
}

export async function createManualRiskAssessmentAction(input: ManualRiskAssessmentInput) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const assessment = await createManualRiskAssessment(ctx, {
    ...input,
    propertyId: requireUuidInput(input.propertyId, 'propertyId'),
  })
  revalidatePath('/hospitality/risk')
  return { assessmentId: assessment.id }
}

export async function archiveRiskHazardAction(
  assessmentId: string,
  hazardId: string,
  input: Parameters<typeof setRiskHazardArchived>[3],
) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const id = requireUuidInput(assessmentId, 'assessmentId')
  await setRiskHazardArchived(ctx, id, requireUuidInput(hazardId, 'hazardId'), input)
  revalidatePath(`/hospitality/risk/assessments/${id}`)
  revalidatePath('/hospitality/risk')
  revalidatePath('/hospitality/risk/review-schedule')
}

export async function selectRiskMatrixAction(
  assessmentId: string,
  input: Parameters<typeof selectRiskAssessmentMatrix>[2],
) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const id = requireUuidInput(assessmentId, 'assessmentId')
  await selectRiskAssessmentMatrix(ctx, id, input)
  revalidatePath(`/hospitality/risk/assessments/${id}`)
  revalidatePath('/hospitality/risk')
  revalidatePath('/hospitality/risk/review-schedule')
}

export async function saveRiskTemplateDraftAction(id: string, input: EditRiskTemplateDraftInput) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const template = await editRiskTemplateDraft(ctx, requireUuidInput(id, 'templateId'), input)
  revalidatePath('/hospitality/risk')
  revalidatePath(`/hospitality/risk/templates/${template.id}`)
  return { updatedAt: template.updatedAt.toISOString() }
}

export async function publishRiskTemplateAction(id: string, expectedUpdatedAt: string) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  await publishRiskTemplateDraft(ctx, requireUuidInput(id, 'templateId'), expectedUpdatedAt)
  revalidatePath('/hospitality/risk')
  revalidatePath(`/hospitality/risk/templates/${id}`)
}

export async function nextRiskTemplateDraftAction(id: string) {
  const ctx = await requireRequestContext()
  await requireRiskSchemaReady(ctx)
  const draft = await createNextRiskTemplateDraft(ctx, requireUuidInput(id, 'templateId'))
  revalidatePath('/hospitality/risk')
  return { templateId: draft.id }
}
