import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, softDelete, timestamps } from './_helpers'
import { tenants, tenantUsers } from './core'
import { hospitalityProperties } from './hospitality'

export const riskTemplateScope = pgEnum('risk_template_scope', ['platform', 'tenant'])
export const riskTemplateState = pgEnum('risk_template_state', ['active', 'retired'])
export const riskTemplateCategory = pgEnum('risk_template_category', [
  'catering',
  'engineering',
  'front_of_house',
  'general',
  'hotel_general',
  'housekeeping',
  'kitchen',
  'leisure',
  'meetings_events',
  'personal',
  'property',
  'restaurant',
])
export const riskAssessmentStatus = pgEnum('risk_assessment_status', ['draft', 'active', 'retired'])

export type RiskTemplateHazard = {
  hazard: string
  harm: string
  peopleAtRisk: string[]
  standardControls: string[]
  initialLikelihood?: number
  initialSeverity?: number
  residualLikelihood?: number
  residualSeverity?: number
}
export type AdoptedRiskTemplateSnapshot = {
  templateId: string
  version: string
  title: string
  category: string
  description: string
  areaGuidance: string | null
  activityEquipmentGuidance: string | null
  hazards: RiskTemplateHazard[]
  peopleAtRiskGuidance: string[]
  standardControls: string[]
  furtherActionGuidance: string | null
  initialRiskGuidance: string | null
  residualRiskGuidance: string | null
  reviewGuidance: string | null
}

export const riskTemplates = pgTable(
  'risk_templates',
  {
    id: id(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    ownerKey: uuid('owner_key').notNull(),
    scope: riskTemplateScope('scope').notNull(),
    title: text('title').notNull(),
    category: riskTemplateCategory('category').notNull(),
    description: text('description').notNull(),
    version: text('version').notNull(),
    state: riskTemplateState('state').default('active').notNull(),
    areaGuidance: text('area_guidance'),
    activityEquipmentGuidance: text('activity_equipment_guidance'),
    hazards: jsonb('hazards').$type<RiskTemplateHazard[]>().default([]).notNull(),
    peopleAtRiskGuidance: jsonb('people_at_risk_guidance').$type<string[]>().default([]).notNull(),
    standardControls: jsonb('standard_controls').$type<string[]>().default([]).notNull(),
    furtherActionGuidance: text('further_action_guidance'),
    initialRiskGuidance: text('initial_risk_guidance'),
    residualRiskGuidance: text('residual_risk_guidance'),
    reviewGuidance: text('review_guidance'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    tenantIdIdUx: uniqueIndex('risk_templates_tenant_id_id_ux').on(t.tenantId, t.id),
    ownerKeyIdUx: uniqueIndex('risk_templates_owner_key_id_ux').on(t.ownerKey, t.id),
    platformTitleVersionUx: uniqueIndex('risk_templates_platform_title_version_ux')
      .on(t.title, t.version)
      .where(sql`${t.tenantId} IS NULL`),
    tenantTitleVersionUx: uniqueIndex('risk_templates_tenant_title_version_ux')
      .on(t.tenantId, t.title, t.version)
      .where(sql`${t.tenantId} IS NOT NULL`),
    categoryStateIdx: index('risk_templates_category_state_idx').on(t.category, t.state),
    scopeTenantCheck: check(
      'risk_templates_scope_tenant_check',
      sql`(${t.scope} = 'platform' AND ${t.tenantId} IS NULL AND ${t.ownerKey} = '00000000-0000-0000-0000-000000000000') OR (${t.scope} = 'tenant' AND ${t.tenantId} IS NOT NULL AND ${t.ownerKey} = ${t.tenantId})`,
    ),
    versionCheck: check('risk_templates_version_check', sql`${t.version} ~ '^[0-9]+\\.[0-9]+$'`),
  }),
)

export const riskAssessments = pgTable(
  'risk_assessments',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').notNull(),
    templateOwnerKey: uuid('template_owner_key').notNull(),
    templateId: uuid('template_id').notNull(),
    adoptedTemplateVersion: text('adopted_template_version').notNull(),
    adoptedTemplateSnapshot: jsonb('adopted_template_snapshot')
      .$type<AdoptedRiskTemplateSnapshot>()
      .notNull(),
    reference: text('reference').notNull(),
    title: text('title').notNull(),
    areaLocation: text('area_location'),
    activityEquipment: text('activity_equipment'),
    creatorTenantUserId: uuid('creator_tenant_user_id').notNull(),
    assessorTenantUserId: uuid('assessor_tenant_user_id').notNull(),
    responsibleTenantUserId: uuid('responsible_tenant_user_id'),
    assessmentDate: date('assessment_date').notNull(),
    status: riskAssessmentStatus('status').default('draft').notNull(),
    comments: text('comments'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    tenantIdIdUx: uniqueIndex('risk_assessments_tenant_id_id_ux').on(t.tenantId, t.id),
    tenantReferenceUx: uniqueIndex('risk_assessments_tenant_reference_ux').on(
      t.tenantId,
      t.reference,
    ),
    propertyStatusIdx: index('risk_assessments_property_status_idx').on(
      t.tenantId,
      t.propertyId,
      t.status,
    ),
    templateIdx: index('risk_assessments_template_idx').on(t.templateId),
    templateFk: foreignKey({
      name: 'risk_assessments_template_fk',
      columns: [t.templateOwnerKey, t.templateId],
      foreignColumns: [riskTemplates.ownerKey, riskTemplates.id],
    }),
    templateOwnerCheck: check(
      'risk_assessments_template_owner_check',
      sql`${t.templateOwnerKey} = ${t.tenantId} OR ${t.templateOwnerKey} = '00000000-0000-0000-0000-000000000000'`,
    ),
    propertyFk: foreignKey({
      name: 'risk_assessments_tenant_property_fk',
      columns: [t.tenantId, t.propertyId],
      foreignColumns: [hospitalityProperties.tenantId, hospitalityProperties.id],
    }),
    creatorFk: foreignKey({
      name: 'risk_assessments_tenant_creator_fk',
      columns: [t.tenantId, t.creatorTenantUserId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    assessorFk: foreignKey({
      name: 'risk_assessments_tenant_assessor_fk',
      columns: [t.tenantId, t.assessorTenantUserId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    responsibleFk: foreignKey({
      name: 'risk_assessments_tenant_responsible_fk',
      columns: [t.tenantId, t.responsibleTenantUserId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    snapshotVersionCheck: check(
      'risk_assessments_snapshot_version_check',
      sql`${t.adoptedTemplateSnapshot}->>'version' = ${t.adoptedTemplateVersion}`,
    ),
  }),
)

export const riskHazards = pgTable(
  'risk_hazards',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    assessmentId: uuid('assessment_id').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    hazardDescription: text('hazard_description').notNull(),
    harmDescription: text('harm_description').notNull(),
    peopleAtRisk: jsonb('people_at_risk').$type<string[]>().default([]).notNull(),
    initialLikelihood: integer('initial_likelihood').notNull(),
    initialSeverity: integer('initial_severity').notNull(),
    initialScore: integer('initial_score').notNull(),
    controls: text('controls').notNull(),
    additionalControls: text('additional_controls'),
    residualLikelihood: integer('residual_likelihood').notNull(),
    residualSeverity: integer('residual_severity').notNull(),
    residualScore: integer('residual_score').notNull(),
    ...timestamps,
  },
  (t) => ({
    tenantIdIdUx: uniqueIndex('risk_hazards_tenant_id_id_ux').on(t.tenantId, t.id),
    assessmentOrderUx: uniqueIndex('risk_hazards_assessment_order_ux').on(
      t.tenantId,
      t.assessmentId,
      t.sortOrder,
    ),
    assessmentFk: foreignKey({
      name: 'risk_hazards_tenant_assessment_fk',
      columns: [t.tenantId, t.assessmentId],
      foreignColumns: [riskAssessments.tenantId, riskAssessments.id],
    }).onDelete('cascade'),
    initialLikelihoodCheck: check(
      'risk_hazards_initial_likelihood_check',
      sql`${t.initialLikelihood} BETWEEN 1 AND 5`,
    ),
    initialSeverityCheck: check(
      'risk_hazards_initial_severity_check',
      sql`${t.initialSeverity} BETWEEN 1 AND 5`,
    ),
    residualLikelihoodCheck: check(
      'risk_hazards_residual_likelihood_check',
      sql`${t.residualLikelihood} BETWEEN 1 AND 5`,
    ),
    residualSeverityCheck: check(
      'risk_hazards_residual_severity_check',
      sql`${t.residualSeverity} BETWEEN 1 AND 5`,
    ),
    initialScoreCheck: check(
      'risk_hazards_initial_score_check',
      sql`${t.initialScore} = ${t.initialLikelihood} * ${t.initialSeverity}`,
    ),
    residualScoreCheck: check(
      'risk_hazards_residual_score_check',
      sql`${t.residualScore} = ${t.residualLikelihood} * ${t.residualSeverity}`,
    ),
  }),
)
