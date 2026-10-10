import { and, asc, eq, isNull, or } from 'drizzle-orm'
import {
  riskAssessments,
  riskHazards,
  riskTemplates,
  riskTemplateFamilies,
  type RiskTemplateHazard,
  type RiskMatrixSnapshot,
} from '@beaconhs/db/schema'
import { assertCan, assignedPropertyIds, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'
import { buildRiskTemplateSnapshot } from './risk-assessments'
import { validateRiskMatrixSnapshot } from './risk-revisions'

export type RiskTemplateSource =
  { kind: 'template'; id: string } | { kind: 'assessment'; id: string }

export type SaveTenantRiskTemplateInput = {
  source: RiskTemplateSource
  title: string
  description: string
}

function text(value: string, label: string, max: number) {
  const result = value.trim()
  if (!result || result.length > max) throw new Error(`${label} is required and must fit the limit`)
  return result
}

/** Create an independent tenant draft; publication is a separate, audited action. */
export async function saveTenantRiskTemplate(
  ctx: RequestContext,
  input: SaveTenantRiskTemplateInput,
) {
  assertCan(ctx, 'hospitality.manage')
  // Templates are readable throughout their tenant. A property-only manager must
  // not publish property content into that wider audience.
  if (assignedPropertyIds(ctx) !== null)
    throw new Error('Tenant-wide management access is required')
  if (!['template', 'assessment'].includes(input.source.kind))
    throw new Error('Invalid template source')
  const title = text(input.title, 'Template title', 300)
  const description = text(input.description, 'Template description', 5_000)

  return ctx.db(async (tx) => {
    let content: Pick<
      typeof riskTemplates.$inferSelect,
      | 'category'
      | 'matrixSnapshot'
      | 'areaGuidance'
      | 'activityEquipmentGuidance'
      | 'hazards'
      | 'peopleAtRiskGuidance'
      | 'standardControls'
      | 'furtherActionGuidance'
      | 'initialRiskGuidance'
      | 'residualRiskGuidance'
      | 'reviewGuidance'
    >
    if (input.source.kind === 'template') {
      const [source] = await tx
        .select()
        .from(riskTemplates)
        .where(
          and(
            eq(riskTemplates.id, input.source.id),
            or(isNull(riskTemplates.tenantId), eq(riskTemplates.tenantId, ctx.tenantId)),
            eq(riskTemplates.state, 'active'),
            isNull(riskTemplates.deletedAt),
          ),
        )
        .limit(1)
      if (!source) throw new Error('Risk template is not available')
      const snapshot = buildRiskTemplateSnapshot(source)
      content = {
        matrixSnapshot: validateRiskMatrixSnapshot(source.matrixSnapshot),
        category: source.category,
        areaGuidance: snapshot.areaGuidance,
        activityEquipmentGuidance: snapshot.activityEquipmentGuidance,
        hazards: snapshot.hazards,
        peopleAtRiskGuidance: snapshot.peopleAtRiskGuidance,
        standardControls: snapshot.standardControls,
        furtherActionGuidance: snapshot.furtherActionGuidance,
        initialRiskGuidance: snapshot.initialRiskGuidance,
        residualRiskGuidance: snapshot.residualRiskGuidance,
        reviewGuidance: snapshot.reviewGuidance,
      }
    } else {
      const [source] = await tx
        .select()
        .from(riskAssessments)
        .where(
          and(
            eq(riskAssessments.tenantId, ctx.tenantId),
            eq(riskAssessments.id, input.source.id),
            isNull(riskAssessments.deletedAt),
          ),
        )
        .limit(1)
        .for('share')
      if (!source) throw new Error('Risk assessment is not available')
      assertCanAccessProperty(ctx, source.propertyId)
      const hazards = await tx
        .select()
        .from(riskHazards)
        .where(
          and(
            eq(riskHazards.tenantId, ctx.tenantId),
            eq(riskHazards.assessmentId, source.id),
            isNull(riskHazards.archivedAt),
          ),
        )
        .orderBy(asc(riskHazards.sortOrder))
      const category = source.assessmentCategory
      if (
        !riskTemplates.category.enumValues.includes(
          category as (typeof riskTemplates.category.enumValues)[number],
        )
      ) {
        throw new Error('The source assessment has an invalid template category')
      }
      content = {
        matrixSnapshot: validateRiskMatrixSnapshot(source.matrixSnapshot),
        category: category as (typeof riskTemplates.category.enumValues)[number],
        areaGuidance: source.areaLocation,
        activityEquipmentGuidance: source.activityEquipment,
        hazards: hazards.map((hazard) => ({
          hazard: hazard.hazardDescription,
          harm: hazard.harmDescription,
          peopleAtRisk: [...hazard.peopleAtRisk],
          standardControls: [hazard.controls],
          initialLikelihood: hazard.initialLikelihood,
          initialSeverity: hazard.initialSeverity,
          residualLikelihood: hazard.residualLikelihood,
          residualSeverity: hazard.residualSeverity,
        })),
        peopleAtRiskGuidance: [...new Set(hazards.flatMap((hazard) => hazard.peopleAtRisk))],
        standardControls: [...new Set(hazards.map((hazard) => hazard.controls))],
        furtherActionGuidance:
          hazards
            .filter((hazard) => hazard.additionalControls?.trim())
            .map((hazard) => `${hazard.hazardDescription}: ${hazard.additionalControls}`)
            .join('\n') || null,
        initialRiskGuidance: source.adoptedTemplateSnapshot?.initialRiskGuidance ?? null,
        residualRiskGuidance: source.adoptedTemplateSnapshot?.residualRiskGuidance ?? null,
        reviewGuidance: source.adoptedTemplateSnapshot?.reviewGuidance ?? null,
      }
    }
    if (!content.hazards.length) throw new Error('At least one saved hazard is required')
    const [family] = await tx
      .insert(riskTemplateFamilies)
      .values({ tenantId: ctx.tenantId, ownerKey: ctx.tenantId, scope: 'tenant' })
      .returning()
    if (!family) throw new Error('Template family creation failed')
    const [template] = await tx
      .insert(riskTemplates)
      .values({
        ...content,
        tenantId: ctx.tenantId,
        ownerKey: ctx.tenantId,
        scope: 'tenant',
        templateFamilyId: family.id,
        title,
        description,
        version: '1.0',
        state: 'draft',
      })
      .onConflictDoNothing()
      .returning()
    if (!template) throw new Error('A tenant template with this title and version already exists')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_template',
      entityId: template.id,
      action: 'create',
      summary: `Created tenant risk template ${template.title} v${template.version}`,
      after: {
        title,
        version: template.version,
        scope: template.scope,
        hazardCount: content.hazards.length,
      },
      metadata: {
        event: 'tenant_risk_template_created',
        sourceKind: input.source.kind,
        sourceId: input.source.id,
      },
    })
    return template
  })
}

export type EditRiskTemplateDraftInput = {
  title: string
  description: string
  category: typeof riskTemplates.$inferSelect.category
  hazards: RiskTemplateHazard[]
  matrix: RiskMatrixSnapshot
  expectedUpdatedAt: string
}

function assertTemplateManager(ctx: RequestContext) {
  assertCan(ctx, 'hospitality.manage')
  if (assignedPropertyIds(ctx) !== null)
    throw new Error('Tenant-wide management access is required')
}

export async function editRiskTemplateDraft(
  ctx: RequestContext,
  id: string,
  input: EditRiskTemplateDraftInput,
) {
  assertTemplateManager(ctx)
  const title = text(input.title, 'Title', 300),
    description = text(input.description, 'Description', 5000)
  const matrixSnapshot = validateRiskMatrixSnapshot(input.matrix)
  if (!riskTemplates.category.enumValues.includes(input.category))
    throw new Error('Invalid category')
  if (!input.hazards.length || input.hazards.length > 200)
    throw new Error('Add between 1 and 200 hazards')
  const hazards = input.hazards.map((h) => {
    for (const value of [
      h.initialLikelihood,
      h.initialSeverity,
      h.residualLikelihood,
      h.residualSeverity,
    ])
      if (!Number.isInteger(value) || value! < 1 || value! > matrixSnapshot.size)
        throw new Error('Hazard ratings must fit the matrix')
    if (!h.peopleAtRisk.length || !h.standardControls.length)
      throw new Error('People at risk and controls are required')
    return {
      ...h,
      hazard: text(h.hazard, 'Hazard', 500),
      harm: text(h.harm, 'Harm', 2000),
      peopleAtRisk: h.peopleAtRisk.map((v) => text(v, 'Person at risk', 100)),
      standardControls: h.standardControls.map((v) => text(v, 'Control', 5000)),
    }
  })
  return ctx.db(async (tx) => {
    const [current] = await tx
      .select()
      .from(riskTemplates)
      .where(
        and(
          eq(riskTemplates.id, id),
          eq(riskTemplates.tenantId, ctx.tenantId),
          eq(riskTemplates.state, 'draft'),
        ),
      )
      .for('update')
    if (!current || current.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new Error('Draft changed. Reload before saving.')
    const [updated] = await tx
      .update(riskTemplates)
      .set({
        title,
        description,
        category: input.category,
        hazards,
        matrixSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(riskTemplates.id, id))
      .returning()
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_template',
      entityId: id,
      action: 'update',
      summary: `Edited template draft ${title}`,
      metadata: { event: 'template_draft_edited' },
    })
    return updated!
  })
}

export async function publishRiskTemplateDraft(
  ctx: RequestContext,
  id: string,
  expectedUpdatedAt: string,
) {
  assertTemplateManager(ctx)
  return ctx.db(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(riskTemplates)
      .where(and(eq(riskTemplates.id, id), eq(riskTemplates.tenantId, ctx.tenantId)))
      .limit(1)
    if (!candidate) throw new Error('Template not found')
    // Serialize all publication/version changes in a family before locking its rows.
    await tx
      .select()
      .from(riskTemplateFamilies)
      .where(
        and(
          eq(riskTemplateFamilies.id, candidate.templateFamilyId),
          eq(riskTemplateFamilies.tenantId, ctx.tenantId),
        ),
      )
      .for('update')
    const [draft] = await tx
      .select()
      .from(riskTemplates)
      .where(eq(riskTemplates.id, id))
      .for('update')
    if (!draft || draft.state !== 'draft' || draft.updatedAt.toISOString() !== expectedUpdatedAt)
      throw new Error('Draft changed. Reload before publishing.')
    validateRiskMatrixSnapshot(draft.matrixSnapshot)
    if (!draft.hazards.length) throw new Error('At least one hazard is required')
    await tx
      .update(riskTemplates)
      .set({ state: 'retired', updatedAt: new Date() })
      .where(
        and(
          eq(riskTemplates.tenantId, ctx.tenantId),
          eq(riskTemplates.templateFamilyId, draft.templateFamilyId),
          eq(riskTemplates.state, 'active'),
        ),
      )
    await tx
      .update(riskTemplates)
      .set({ state: 'active', updatedAt: new Date() })
      .where(eq(riskTemplates.id, id))
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_template',
      entityId: id,
      action: 'update',
      summary: `Published template ${draft.title} v${draft.version}`,
      metadata: { event: 'template_published', familyId: draft.templateFamilyId },
    })
  })
}

export async function createNextRiskTemplateDraft(ctx: RequestContext, id: string) {
  assertTemplateManager(ctx)
  return ctx.db(async (tx) => {
    const [source] = await tx
      .select()
      .from(riskTemplates)
      .where(
        and(
          eq(riskTemplates.id, id),
          eq(riskTemplates.tenantId, ctx.tenantId),
          isNull(riskTemplates.deletedAt),
        ),
      )
      .limit(1)
    if (!source || source.state === 'draft') throw new Error('Select a published template')
    await tx
      .select()
      .from(riskTemplateFamilies)
      .where(eq(riskTemplateFamilies.id, source.templateFamilyId))
      .for('update')
    const versions = await tx
      .select()
      .from(riskTemplates)
      .where(
        and(
          eq(riskTemplates.tenantId, ctx.tenantId),
          eq(riskTemplates.templateFamilyId, source.templateFamilyId),
        ),
      )
    if (versions.some((row) => row.state === 'draft'))
      throw new Error('This family already has a draft')
    const major = Math.max(...versions.map((row) => Number(row.version.split('.')[0])))
    if (!Number.isSafeInteger(major + 1)) throw new Error('Template version limit reached')
    const { id: oldId, createdAt, updatedAt, ...content } = source
    const [draft] = await tx
      .insert(riskTemplates)
      .values({ ...content, version: `${major + 1}.0`, state: 'draft' })
      .returning()
    if (!draft) throw new Error('Draft creation failed')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'risk_template',
      entityId: draft.id,
      action: 'create',
      summary: `Created draft v${draft.version} of ${source.title}`,
      metadata: {
        event: 'template_version_drafted',
        sourceId: oldId,
        sourceCreatedAt: createdAt,
        sourceUpdatedAt: updatedAt,
      },
    })
    return draft
  })
}
