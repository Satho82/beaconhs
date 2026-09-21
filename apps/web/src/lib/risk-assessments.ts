import { randomBytes } from 'node:crypto'
import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm'
import {
  correctiveActions,
  hospitalityProperties,
  riskAssessments,
  riskHazards,
  riskTemplates,
  tenantUsers,
  type AdoptedRiskTemplateSnapshot,
  type RiskTemplateHazard,
} from '@beaconhs/db/schema'
import { riskScore, type Database } from '@beaconhs/db'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import {
  assertCanAccessProperty,
  hospitalityPropertyWhere,
} from '@/lib/hospitality/property-access'

export type RiskLibraryFilter = {
  category?: (typeof riskTemplates.category.enumValues)[number]
  state?: (typeof riskTemplates.state.enumValues)[number]
  search?: string
}

export type RiskHazardInput = {
  hazardDescription: string
  harmDescription: string
  peopleAtRisk: string[]
  initialLikelihood: number
  initialSeverity: number
  controls: string
  additionalControls?: string | null
  residualLikelihood: number
  residualSeverity: number
}

export type AdoptRiskAssessmentInput = {
  templateId: string
  propertyId: string
  title?: string
  areaLocation?: string | null
  activityEquipment?: string | null
  assessorTenantUserId?: string
  responsibleTenantUserId?: string | null
  assessmentDate?: string
}

export type UpdateRiskAssessmentInput = {
  title: string
  areaLocation?: string | null
  activityEquipment?: string | null
  assessorTenantUserId: string
  responsibleTenantUserId?: string | null
  assessmentDate: string
  comments?: string | null
  hazards: RiskHazardInput[]
}

export type CreateRiskCorrectiveActionInput = {
  hazardId: string
  title: string
  description?: string | null
  ownerTenantUserId: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  dueOn: string
  verificationRequired?: boolean
}

function requiredText(value: string, label: string, max: number): string {
  const result = value.trim()
  if (!result) throw new Error(`${label} is required`)
  if (result.length > max) throw new Error(`${label} is too long`)
  return result
}

function optionalText(value: string | null | undefined, max: number): string | null {
  const result = value?.trim() ?? ''
  if (result.length > max) throw new Error('Text is too long')
  return result || null
}

function requireMembership(ctx: RequestContext): string {
  const id = ctx.membership?.id
  if (!id || id === 'super-admin') throw new Error('A tenant membership is required')
  return id
}

export function buildRiskTemplateSnapshot(
  template: typeof riskTemplates.$inferSelect,
): AdoptedRiskTemplateSnapshot {
  return structuredClone({
    templateId: template.id,
    version: template.version,
    title: template.title,
    category: template.category,
    description: template.description,
    areaGuidance: template.areaGuidance,
    activityEquipmentGuidance: template.activityEquipmentGuidance,
    hazards: template.hazards,
    peopleAtRiskGuidance: template.peopleAtRiskGuidance,
    standardControls: template.standardControls,
    furtherActionGuidance: template.furtherActionGuidance,
    initialRiskGuidance: template.initialRiskGuidance,
    residualRiskGuidance: template.residualRiskGuidance,
    reviewGuidance: template.reviewGuidance,
  })
}

function hazardValues(
  tenantId: string,
  assessmentId: string,
  hazards: RiskHazardInput[],
): (typeof riskHazards.$inferInsert)[] {
  if (hazards.length === 0) throw new Error('At least one hazard is required')
  return hazards.map((hazard, sortOrder) => ({
    tenantId,
    assessmentId,
    sortOrder,
    hazardDescription: requiredText(hazard.hazardDescription, 'Hazard', 500),
    harmDescription: requiredText(hazard.harmDescription, 'How harm may occur', 2_000),
    peopleAtRisk: hazard.peopleAtRisk.map((person) => requiredText(person, 'Person at risk', 100)),
    initialLikelihood: hazard.initialLikelihood,
    initialSeverity: hazard.initialSeverity,
    initialScore: riskScore(hazard.initialLikelihood, hazard.initialSeverity),
    controls: requiredText(hazard.controls, 'Controls', 5_000),
    additionalControls: optionalText(hazard.additionalControls, 5_000),
    residualLikelihood: hazard.residualLikelihood,
    residualSeverity: hazard.residualSeverity,
    residualScore: riskScore(hazard.residualLikelihood, hazard.residualSeverity),
  }))
}

export function templateHazardsToInput(hazards: RiskTemplateHazard[]): RiskHazardInput[] {
  return hazards.map((hazard) => ({
    hazardDescription: hazard.hazard,
    harmDescription: hazard.harm,
    peopleAtRisk: [...hazard.peopleAtRisk],
    initialLikelihood: hazard.initialLikelihood ?? 3,
    initialSeverity: hazard.initialSeverity ?? 3,
    controls: hazard.standardControls.join('\n'),
    additionalControls: null,
    residualLikelihood: hazard.residualLikelihood ?? 2,
    residualSeverity: hazard.residualSeverity ?? 3,
  }))
}

async function assertTenantUsers(
  tx: Database,
  tenantId: string,
  ids: (string | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  for (const id of unique) {
    const [row] = await tx
      .select({ id: tenantUsers.id })
      .from(tenantUsers)
      .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.id, id)))
      .limit(1)
    if (!row) throw new Error('Selected person does not belong to this tenant')
  }
}

export async function listRiskTemplates(ctx: RequestContext, filter: RiskLibraryFilter = {}) {
  assertCan(ctx, 'hospitality.read')
  const search = filter.search?.trim()
  return ctx.db((tx) =>
    tx
      .select()
      .from(riskTemplates)
      .where(
        and(
          isNull(riskTemplates.deletedAt),
          filter.category ? eq(riskTemplates.category, filter.category) : undefined,
          filter.state ? eq(riskTemplates.state, filter.state) : undefined,
          search
            ? or(
                ilike(riskTemplates.title, `%${search}%`),
                ilike(riskTemplates.description, `%${search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(asc(riskTemplates.category), asc(riskTemplates.title), asc(riskTemplates.version)),
  )
}

export async function getRiskTemplate(ctx: RequestContext, templateId: string) {
  assertCan(ctx, 'hospitality.read')
  const [template] = await ctx.db((tx) =>
    tx
      .select()
      .from(riskTemplates)
      .where(and(eq(riskTemplates.id, templateId), isNull(riskTemplates.deletedAt)))
      .limit(1),
  )
  return template ?? null
}

export async function adoptRiskAssessment(ctx: RequestContext, input: AdoptRiskAssessmentInput) {
  assertCan(ctx, 'hospitality.manage')
  assertCanAccessProperty(ctx, input.propertyId)
  const creatorId = requireMembership(ctx)
  const assessorId = input.assessorTenantUserId ?? creatorId

  return ctx.db(async (tx) => {
    const [property] = await tx
      .select({ id: hospitalityProperties.id })
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          eq(hospitalityProperties.id, input.propertyId),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1)
    if (!property) throw new Error('Property does not exist in this tenant')

    const [template] = await tx
      .select()
      .from(riskTemplates)
      .where(
        and(
          eq(riskTemplates.id, input.templateId),
          eq(riskTemplates.state, 'active'),
          isNull(riskTemplates.deletedAt),
          or(isNull(riskTemplates.tenantId), eq(riskTemplates.tenantId, ctx.tenantId)),
        ),
      )
      .limit(1)
      .for('share')
    if (!template) throw new Error('Risk template is not available to this tenant')

    await assertTenantUsers(tx, ctx.tenantId, [
      creatorId,
      assessorId,
      input.responsibleTenantUserId,
    ])
    const snapshot = buildRiskTemplateSnapshot(template)
    const reference =
      `RA-${new Date().getUTCFullYear()}-` + randomBytes(4).toString('hex').toUpperCase()
    const [assessment] = await tx
      .insert(riskAssessments)
      .values({
        tenantId: ctx.tenantId,
        propertyId: property.id,
        templateOwnerKey: template.ownerKey,
        templateId: template.id,
        adoptedTemplateVersion: template.version,
        adoptedTemplateSnapshot: snapshot,
        reference,
        title: requiredText(input.title ?? template.title, 'Assessment title', 300),
        areaLocation: optionalText(input.areaLocation ?? template.areaGuidance, 1_000),
        activityEquipment: optionalText(
          input.activityEquipment ?? template.activityEquipmentGuidance,
          1_000,
        ),
        creatorTenantUserId: creatorId,
        assessorTenantUserId: assessorId,
        responsibleTenantUserId: input.responsibleTenantUserId ?? null,
        assessmentDate: input.assessmentDate ?? new Date().toISOString().slice(0, 10),
      })
      .returning()
    if (!assessment) throw new Error('Risk assessment creation failed')

    const hazards = hazardValues(
      ctx.tenantId,
      assessment.id,
      templateHazardsToInput(snapshot.hazards),
    )
    const createdHazards = await tx.insert(riskHazards).values(hazards).returning()

    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessment.id,
      action: 'create',
      summary: `Adopted ${template.title} v${template.version} as ${reference}`,
      after: {
        propertyId: property.id,
        templateId: template.id,
        templateVersion: template.version,
        hazardCount: createdHazards.length,
      },
      metadata: { event: 'template_adoption' },
    })
    return { assessment, hazards: createdHazards }
  })
}

export async function updateRiskAssessment(
  ctx: RequestContext,
  assessmentId: string,
  input: UpdateRiskAssessmentInput,
) {
  assertCan(ctx, 'hospitality.manage')
  return ctx.db(async (tx) => {
    const [current] = await tx
      .select()
      .from(riskAssessments)
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          eq(riskAssessments.id, assessmentId),
          isNull(riskAssessments.deletedAt),
        ),
      )
      .limit(1)
      .for('update')
    if (!current) throw new Error('Risk assessment not found')
    assertCanAccessProperty(ctx, current.propertyId)

    await assertTenantUsers(tx, ctx.tenantId, [
      input.assessorTenantUserId,
      input.responsibleTenantUserId,
    ])
    const [updated] = await tx
      .update(riskAssessments)
      .set({
        title: requiredText(input.title, 'Assessment title', 300),
        areaLocation: optionalText(input.areaLocation, 1_000),
        activityEquipment: optionalText(input.activityEquipment, 1_000),
        assessorTenantUserId: input.assessorTenantUserId,
        responsibleTenantUserId: input.responsibleTenantUserId ?? null,
        assessmentDate: input.assessmentDate,
        comments: optionalText(input.comments, 5_000),
        updatedAt: new Date(),
      })
      .where(and(eq(riskAssessments.tenantId, ctx.tenantId), eq(riskAssessments.id, assessmentId)))
      .returning()
    if (!updated) throw new Error('Risk assessment update failed')

    await tx
      .delete(riskHazards)
      .where(
        and(eq(riskHazards.tenantId, ctx.tenantId), eq(riskHazards.assessmentId, assessmentId)),
      )
    const hazards = await tx
      .insert(riskHazards)
      .values(hazardValues(ctx.tenantId, assessmentId, input.hazards))
      .returning()

    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessmentId,
      action: 'update',
      summary: `Updated risk assessment ${current.reference}`,
      before: {
        title: current.title,
        areaLocation: current.areaLocation,
        activityEquipment: current.activityEquipment,
        assessorTenantUserId: current.assessorTenantUserId,
        responsibleTenantUserId: current.responsibleTenantUserId,
        assessmentDate: current.assessmentDate,
        comments: current.comments,
      },
      after: {
        title: updated.title,
        areaLocation: updated.areaLocation,
        activityEquipment: updated.activityEquipment,
        assessorTenantUserId: updated.assessorTenantUserId,
        responsibleTenantUserId: updated.responsibleTenantUserId,
        assessmentDate: updated.assessmentDate,
        comments: updated.comments,
        hazardCount: hazards.length,
      },
    })
    return { assessment: updated, hazards }
  })
}

export async function getRiskAssessment(ctx: RequestContext, assessmentId: string) {
  assertCan(ctx, 'hospitality.read')
  return ctx.db(async (tx) => {
    const [row] = await tx
      .select({ assessment: riskAssessments, property: hospitalityProperties })
      .from(riskAssessments)
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, riskAssessments.tenantId),
          eq(hospitalityProperties.id, riskAssessments.propertyId),
        ),
      )
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          eq(riskAssessments.id, assessmentId),
          isNull(riskAssessments.deletedAt),
        ),
      )
      .limit(1)
    if (!row) return null
    assertCanAccessProperty(ctx, row.assessment.propertyId)
    const hazards = await tx
      .select()
      .from(riskHazards)
      .where(
        and(eq(riskHazards.tenantId, ctx.tenantId), eq(riskHazards.assessmentId, assessmentId)),
      )
      .orderBy(asc(riskHazards.sortOrder))
    return { ...row, hazards }
  })
}

export async function listRiskAssessments(ctx: RequestContext, propertyId?: string) {
  assertCan(ctx, 'hospitality.read')
  if (propertyId) assertCanAccessProperty(ctx, propertyId)
  const propertyScope = hospitalityPropertyWhere(ctx, riskAssessments.propertyId)
  return ctx.db((tx) =>
    tx
      .select({ assessment: riskAssessments, property: hospitalityProperties })
      .from(riskAssessments)
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, riskAssessments.tenantId),
          eq(hospitalityProperties.id, riskAssessments.propertyId),
        ),
      )
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          isNull(riskAssessments.deletedAt),
          propertyId ? eq(riskAssessments.propertyId, propertyId) : propertyScope,
        ),
      )
      .orderBy(asc(hospitalityProperties.name), asc(riskAssessments.reference)),
  )
}

export async function createRiskCorrectiveAction(
  ctx: RequestContext,
  assessmentId: string,
  input: CreateRiskCorrectiveActionInput,
) {
  assertCan(ctx, 'hospitality.manage')
  assertCan(ctx, 'ca.create')
  return ctx.db(async (tx) => {
    const [source] = await tx
      .select({
        propertyId: riskAssessments.propertyId,
        reference: riskAssessments.reference,
        hazardId: riskHazards.id,
      })
      .from(riskAssessments)
      .innerJoin(
        riskHazards,
        and(
          eq(riskHazards.tenantId, riskAssessments.tenantId),
          eq(riskHazards.assessmentId, riskAssessments.id),
          eq(riskHazards.id, input.hazardId),
        ),
      )
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          eq(riskAssessments.id, assessmentId),
          isNull(riskAssessments.deletedAt),
        ),
      )
      .limit(1)
    if (!source) throw new Error('Risk hazard not found')
    assertCanAccessProperty(ctx, source.propertyId)
    await assertTenantUsers(tx, ctx.tenantId, [input.ownerTenantUserId])

    const [action] = await tx
      .insert(correctiveActions)
      .values({
        tenantId: ctx.tenantId,
        reference: `CA-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`,
        title: requiredText(input.title, 'Corrective action title', 300),
        description: optionalText(input.description, 2_000),
        severity: input.priority,
        source: 'other',
        sourceEntityType: 'risk_hazard',
        sourceEntityId: source.hazardId,
        assignedByTenantUserId: requireMembership(ctx),
        ownerTenantUserId: input.ownerTenantUserId,
        assignedOn: new Date().toISOString().slice(0, 10),
        dueOn: input.dueOn,
        verificationRequired: input.verificationRequired ?? true,
        metadata: {
          riskAssessmentId: assessmentId,
          riskAssessmentReference: source.reference,
          propertyId: source.propertyId,
        },
      })
      .returning()
    if (!action) throw new Error('Corrective action creation failed')

    await recordAuditInTransaction(tx, ctx, {
      entityType: 'corrective_action',
      entityId: action.id,
      action: 'create',
      summary: `Created corrective action from risk assessment ${source.reference}`,
      after: {
        riskAssessmentId: assessmentId,
        riskHazardId: source.hazardId,
        ownerTenantUserId: action.ownerTenantUserId,
        severity: action.severity,
        dueOn: action.dueOn,
      },
    })
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessmentId,
      action: 'update',
      summary: `Linked corrective action ${action.reference}`,
      metadata: { correctiveActionId: action.id, riskHazardId: source.hazardId },
    })
    return action
  })
}
