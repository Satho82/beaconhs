import { randomBytes } from 'node:crypto'
import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm'
import {
  correctiveActions,
  hospitalityProperties,
  riskAssessments,
  riskHazards,
  riskTemplates,
  type RiskMatrixSnapshot,
  tenantUsers,
  type AdoptedRiskTemplateSnapshot,
  type RiskTemplateHazard,
} from '@beaconhs/db/schema'
import { riskCatalogueMetadata, riskScore, type Database } from '@beaconhs/db'
import { assertCan, can, assignedPropertyIds, type RequestContext } from '@beaconhs/tenant'
import { validateRiskMatrixSnapshot, writeRiskRevision } from './risk-revisions'
import { recordAuditInTransaction } from '@/lib/audit'
import { planRiskHazardEdit } from './risk-hazard-edit'
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
  id?: string
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
  expectedRevision: number
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
    templateFamilyId: template.templateFamilyId,
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
          !can(ctx, 'hospitality.manage') || assignedPropertyIds(ctx) !== null
            ? eq(riskTemplates.state, 'active')
            : undefined,
          or(
            and(eq(riskTemplates.scope, 'platform'), isNull(riskTemplates.tenantId)),
            and(eq(riskTemplates.scope, 'tenant'), eq(riskTemplates.tenantId, ctx.tenantId)),
          ),
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
  return template?.state === 'draft' &&
    (!can(ctx, 'hospitality.manage') || assignedPropertyIds(ctx) !== null)
    ? null
    : (template ?? null)
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

    const templateIdentity = and(
      eq(riskTemplates.id, input.templateId),
      eq(riskTemplates.state, 'active'),
      isNull(riskTemplates.deletedAt),
    )
    // Tenant templates are tenant-owned and can be locked under their UPDATE
    // policy. Platform templates are deliberately read-only under RLS, so a
    // locking clause would apply that UPDATE policy and hide the platform row.
    let [template] = await tx
      .select()
      .from(riskTemplates)
      .where(and(templateIdentity, eq(riskTemplates.tenantId, ctx.tenantId)))
      .limit(1)
      .for('share')
    if (!template) {
      const [platformTemplate] = await tx
        .select()
        .from(riskTemplates)
        .where(and(templateIdentity, isNull(riskTemplates.tenantId)))
        .limit(1)
      template = platformTemplate
    }
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
        assessmentCategory: template.category,
        matrixSnapshot: validateRiskMatrixSnapshot(template.matrixSnapshot),
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
    await writeRiskRevision(tx, ctx, assessment, 'adopted')

    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessment.id,
      action: 'create',
      summary: `Adopted ${template.title} v${riskCatalogueMetadata(template)?.version ?? template.version} as ${reference}`,
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
    if (current.contentRevision !== input.expectedRevision)
      throw new Error('This assessment has changed. Reload before saving.')
    if (current.status === 'retired') throw new Error('Re-adopt this assessment before editing')
    const matrix = validateRiskMatrixSnapshot(current.matrixSnapshot)
    for (const hazard of input.hazards) {
      if (
        [
          hazard.initialLikelihood,
          hazard.initialSeverity,
          hazard.residualLikelihood,
          hazard.residualSeverity,
        ].some((value) => !Number.isInteger(value) || value < 1 || value > matrix.size)
      )
        throw new Error('Hazard ratings must fit the assessment matrix')
    }

    const previousHazards = await tx
      .select()
      .from(riskHazards)
      .where(
        and(eq(riskHazards.tenantId, ctx.tenantId), eq(riskHazards.assessmentId, assessmentId)),
      )
      .orderBy(asc(riskHazards.sortOrder))
      .for('update')
    const activeHazards = previousHazards.filter((hazard) => !hazard.archivedAt)
    const parkedHazards = planRiskHazardEdit(activeHazards, input.hazards)
    const archivedEnd = Math.max(
      -1,
      ...previousHazards.filter((hazard) => hazard.archivedAt).map((hazard) => hazard.sortOrder),
    )
    const values = hazardValues(ctx.tenantId, assessmentId, input.hazards).map((value, index) => ({
      ...value,
      sortOrder: archivedEnd + 1 + index,
    }))
    const parkingStart =
      Math.max(
        archivedEnd + values.length + 1,
        ...previousHazards.map((hazard) => hazard.sortOrder),
      ) + 1

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
        contentRevision: current.contentRevision + 1,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(and(eq(riskAssessments.tenantId, ctx.tenantId), eq(riskAssessments.id, assessmentId)))
      .returning()
    if (!updated) throw new Error('Risk assessment update failed')

    const hazardWhere = (id: string) =>
      and(
        eq(riskHazards.tenantId, ctx.tenantId),
        eq(riskHazards.assessmentId, assessmentId),
        eq(riskHazards.id, id),
      )
    for (const [index, parked] of parkedHazards.entries()) {
      await tx
        .update(riskHazards)
        .set({ sortOrder: parkingStart + index })
        .where(hazardWhere(parked.id))
    }
    const hazards: (typeof riskHazards.$inferSelect)[] = []
    for (const [index, value] of values.entries()) {
      const id = input.hazards[index]!.id
      const [hazard] = id
        ? await tx
            .update(riskHazards)
            .set({ ...value, updatedAt: new Date() })
            .where(hazardWhere(id))
            .returning()
        : await tx.insert(riskHazards).values(value).returning()
      if (!hazard) throw new Error('Risk hazard update failed')
      hazards.push(hazard)
    }

    await writeRiskRevision(tx, ctx, updated, 'edited')
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
        hazards: previousHazards,
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
        hazards,
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

export type ManualRiskAssessmentInput = {
  propertyId: string
  title: string
  category: typeof riskTemplates.$inferSelect.category
  matrix: RiskMatrixSnapshot
}

export async function createManualRiskAssessment(
  ctx: RequestContext,
  input: ManualRiskAssessmentInput,
) {
  assertCan(ctx, 'hospitality.manage')
  assertCanAccessProperty(ctx, input.propertyId)
  const actor = requireMembership(ctx)
  const title = requiredText(input.title, 'Assessment title', 300)
  if (!riskTemplates.category.enumValues.includes(input.category))
    throw new Error('Select a category')
  const matrixSnapshot = validateRiskMatrixSnapshot(input.matrix)
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
    if (!property) throw new Error('Property not found')
    await assertTenantUsers(tx, ctx.tenantId, [actor])
    const [assessment] = await tx
      .insert(riskAssessments)
      .values({
        tenantId: ctx.tenantId,
        propertyId: property.id,
        sourceKind: 'manual',
        assessmentCategory: input.category,
        matrixSnapshot,
        title,
        reference: `RA-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`,
        creatorTenantUserId: actor,
        assessorTenantUserId: actor,
        assessmentDate: new Date().toISOString().slice(0, 10),
      })
      .returning()
    if (!assessment) throw new Error('Assessment creation failed')
    await writeRiskRevision(tx, ctx, assessment, 'adopted')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessment.id,
      action: 'create',
      summary: `Created manual risk assessment ${assessment.reference}`,
      metadata: { event: 'manual_assessment_created', propertyId: property.id },
    })
    return assessment
  })
}

export async function setRiskHazardArchived(
  ctx: RequestContext,
  assessmentId: string,
  hazardId: string,
  input: { archived: boolean; reason: string; expectedRevision: number },
) {
  assertCan(ctx, 'hospitality.manage')
  const actor = requireMembership(ctx)
  const reason = requiredText(input.reason, 'Reason', 2000)
  if (typeof input.archived !== 'boolean') throw new Error('Archive state must be a boolean')
  return ctx.db(async (tx) => {
    const [assessment] = await tx
      .select()
      .from(riskAssessments)
      .where(
        and(
          eq(riskAssessments.tenantId, ctx.tenantId),
          eq(riskAssessments.id, assessmentId),
          isNull(riskAssessments.deletedAt),
        ),
      )
      .for('update')
    if (!assessment) throw new Error('Assessment not found')
    assertCanAccessProperty(ctx, assessment.propertyId)
    if (assessment.contentRevision !== input.expectedRevision)
      throw new Error('Assessment changed. Reload before continuing.')
    if (assessment.status === 'retired') throw new Error('Re-adopt this assessment before editing')
    validateRiskMatrixSnapshot(assessment.matrixSnapshot)
    const [hazard] = await tx
      .select()
      .from(riskHazards)
      .where(
        and(
          eq(riskHazards.tenantId, ctx.tenantId),
          eq(riskHazards.assessmentId, assessmentId),
          eq(riskHazards.id, hazardId),
        ),
      )
      .for('update')
    if (!hazard || Boolean(hazard.archivedAt) === input.archived)
      throw new Error('Hazard state has changed')
    await tx
      .update(riskHazards)
      .set({
        archivedAt: input.archived ? new Date() : null,
        archivedByTenantUserId: input.archived ? actor : null,
        archiveReason: input.archived ? reason : null,
        updatedAt: new Date(),
      })
      .where(eq(riskHazards.id, hazard.id))
    const [updated] = await tx
      .update(riskAssessments)
      .set({
        contentRevision: assessment.contentRevision + 1,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(riskAssessments.id, assessmentId))
      .returning()
    if (!updated) throw new Error('Assessment update failed')
    const event = input.archived ? 'hazard_archived' : 'hazard_restored'
    await writeRiskRevision(tx, ctx, updated, event, reason)
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessmentId,
      action: 'update',
      summary: `${input.archived ? 'Archived' : 'Restored'} hazard in ${assessment.reference}`,
      metadata: { event, hazardId, reason, contentRevision: updated.contentRevision },
    })
    return updated
  })
}

export async function selectRiskAssessmentMatrix(
  ctx: RequestContext,
  assessmentId: string,
  input: { matrix: RiskMatrixSnapshot; reason: string; expectedRevision: number },
) {
  assertCan(ctx, 'hospitality.manage')
  const matrixSnapshot = validateRiskMatrixSnapshot(input.matrix)
  const reason = requiredText(input.reason, 'Reason', 2000)
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
      .for('update')
    if (!current) throw new Error('Assessment not found')
    assertCanAccessProperty(ctx, current.propertyId)
    if (current.contentRevision !== input.expectedRevision || current.status === 'retired')
      throw new Error('Reload the assessment before changing the matrix')
    const hazards = await tx
      .select()
      .from(riskHazards)
      .where(
        and(eq(riskHazards.tenantId, ctx.tenantId), eq(riskHazards.assessmentId, assessmentId)),
      )
      .for('update')
    if (
      hazards.some((h) =>
        [h.initialLikelihood, h.initialSeverity, h.residualLikelihood, h.residualSeverity].some(
          (v) => v > matrixSnapshot.size,
        ),
      )
    )
      throw new Error('Existing hazard ratings exceed the selected matrix')
    const [updated] = await tx
      .update(riskAssessments)
      .set({
        matrixSnapshot,
        contentRevision: current.contentRevision + 1,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(riskAssessments.id, assessmentId))
      .returning()
    if (!updated) throw new Error('Assessment update failed')
    await writeRiskRevision(tx, ctx, updated, 'matrix_changed', reason)
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_assessment',
      entityId: assessmentId,
      action: 'update',
      summary: `Selected matrix for ${current.reference}`,
      metadata: { event: 'matrix_changed', reason, contentRevision: updated.contentRevision },
    })
    return updated
  })
}

export async function createRiskCorrectiveAction(
  ctx: RequestContext,
  assessmentId: string,
  input: CreateRiskCorrectiveActionInput,
) {
  assertCan(ctx, 'hospitality.manage')
  assertCan(ctx, 'ca.create')
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
      .for('update')
    if (!current) throw new Error('Assessment not found')
    assertCanAccessProperty(ctx, current.propertyId)
    validateRiskMatrixSnapshot(current.matrixSnapshot)
    if (current.status === 'retired')
      throw new Error('Re-adopt this assessment before adding actions')
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
          isNull(riskHazards.archivedAt),
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
    const [revised] = await tx
      .update(riskAssessments)
      .set({ contentRevision: current.contentRevision + 1, updatedAt: new Date() })
      .where(and(eq(riskAssessments.tenantId, ctx.tenantId), eq(riskAssessments.id, assessmentId)))
      .returning()
    if (!revised) throw new Error('Assessment revision failed')
    await writeRiskRevision(tx, ctx, revised, 'edited')

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
