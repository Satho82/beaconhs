'use server'

import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import { requireUuidInput } from '@/lib/mutation-input'
import { applyRiskLifecycleAction, type RiskLifecycleAction } from '@/lib/risk-lifecycle'
import {
  adoptRiskAssessment,
  createRiskCorrectiveAction,
  updateRiskAssessment,
  type AdoptRiskAssessmentInput,
  type CreateRiskCorrectiveActionInput,
  type UpdateRiskAssessmentInput,
} from '@/lib/risk-assessments'

export async function adoptRiskAssessmentAction(input: AdoptRiskAssessmentInput) {
  const ctx = await requireRequestContext()
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

export async function saveRiskAssessmentAction(
  assessmentId: string,
  input: UpdateRiskAssessmentInput,
) {
  const ctx = await requireRequestContext()
  const id = requireUuidInput(assessmentId, 'assessmentId')
  await updateRiskAssessment(ctx, id, {
    ...input,
    assessorTenantUserId: requireUuidInput(input.assessorTenantUserId, 'assessorTenantUserId'),
    responsibleTenantUserId: input.responsibleTenantUserId
      ? requireUuidInput(input.responsibleTenantUserId, 'responsibleTenantUserId')
      : null,
  })
  revalidatePath('/hospitality/risk')
  revalidatePath(`/hospitality/risk/assessments/${id}`)
  return { ok: true as const }
}

export async function createRiskCorrectiveActionAction(
  assessmentId: string,
  input: CreateRiskCorrectiveActionInput,
) {
  const ctx = await requireRequestContext()
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
    effectiveDate: string
    validityMonths?: number | null
    customReviewDate?: string | null
    reminderLeadDays: number
    comments?: string
  },
) {
  const ctx = await requireRequestContext()
  const id = requireUuidInput(assessmentId, 'assessmentId')
  await applyRiskLifecycleAction(ctx, id, input)
  revalidatePath('/hospitality/risk')
  revalidatePath(`/hospitality/risk/assessments/${id}`)
  return { ok: true as const }
}
