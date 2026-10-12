import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id } from './_helpers'
import { tenants, tenantUsers } from './core'
import { hospitalityProperties } from './hospitality'
import { auditLog } from './audit'

// Trigger-enforced transitions and append-only evidence live in the reviewed DDL.
// No source-module FK: adapters own source visibility/version validation.
export const approvalWorkflows = pgTable(
  'approval_workflows',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id').notNull(),
    name: text('name').notNull(),
    stages: jsonb('stages').$type<Array<{ name: string; approverId: string }>>().notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.tenantId, t.propertyId, t.id),
    foreignKey({
      columns: [t.tenantId, t.propertyId],
      foreignColumns: [hospitalityProperties.tenantId, hospitalityProperties.id],
    }).onDelete('restrict'),
    check('approval_workflows_name_check', sql`length(btrim(${t.name})) BETWEEN 1 AND 200`),
    check(
      'approval_workflows_stages_check',
      sql`jsonb_typeof(${t.stages})='array' AND jsonb_array_length(${t.stages}) BETWEEN 1 AND 20`,
    ),
  ],
)

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    propertyId: uuid('property_id').notNull(),
    workflowId: uuid('workflow_id').notNull(),
    requesterId: uuid('requester_id').notNull(),
    title: text('title').notNull(),
    sourceModule: text('source_module')
      .$type<'risk' | 'maintenance' | 'compliance' | 'assets_ppm' | 'people' | 'tasks'>()
      .notNull(),
    sourceId: uuid('source_id').notNull(),
    sourceVersion: text('source_version').notNull(),
    creationKey: uuid('creation_key').notNull(),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected'>()
      .default('pending')
      .notNull(),
    currentStage: integer('current_stage').default(1).notNull(),
    stageCount: integer('stage_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.tenantId, t.propertyId, t.id),
    unique().on(t.tenantId, t.creationKey),
    foreignKey({
      columns: [t.tenantId, t.propertyId, t.workflowId],
      foreignColumns: [
        approvalWorkflows.tenantId,
        approvalWorkflows.propertyId,
        approvalWorkflows.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.tenantId, t.requesterId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }).onDelete('restrict'),
    index('approval_requests_queue_idx').on(t.tenantId, t.propertyId, t.status, t.createdAt, t.id),
    check('approval_requests_title_check', sql`length(btrim(${t.title})) BETWEEN 1 AND 300`),
    check(
      'approval_requests_source_module_check',
      sql`${t.sourceModule} IN ('risk','maintenance','compliance','assets_ppm','people','tasks')`,
    ),
    check(
      'approval_requests_source_version_check',
      sql`length(${t.sourceVersion}) BETWEEN 1 AND 200`,
    ),
    check('approval_requests_status_check', sql`${t.status} IN ('pending','approved','rejected')`),
    check('approval_requests_current_stage_check', sql`${t.currentStage} BETWEEN 1 AND 20`),
    check('approval_requests_stage_count_check', sql`${t.stageCount} BETWEEN 1 AND 20`),
    check('approval_requests_check', sql`${t.currentStage} <= ${t.stageCount}`),
  ],
)

export const approvalStages = pgTable(
  'approval_stages',
  {
    tenantId: uuid('tenant_id').notNull(),
    propertyId: uuid('property_id').notNull(),
    requestId: uuid('request_id').notNull(),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    approverId: uuid('approver_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.propertyId, t.requestId, t.position] }),
    unique().on(t.tenantId, t.propertyId, t.requestId, t.position, t.approverId),
    foreignKey({
      columns: [t.tenantId, t.propertyId, t.requestId],
      foreignColumns: [approvalRequests.tenantId, approvalRequests.propertyId, approvalRequests.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.tenantId, t.approverId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }).onDelete('restrict'),
    index('approval_stages_assignee_idx').on(t.tenantId, t.approverId, t.requestId),
    check('approval_stages_position_check', sql`${t.position} BETWEEN 1 AND 20`),
    check('approval_stages_name_check', sql`length(btrim(${t.name})) BETWEEN 1 AND 200`),
  ],
)

export const approvalDecisions = pgTable(
  'approval_decisions',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    propertyId: uuid('property_id').notNull(),
    requestId: uuid('request_id').notNull(),
    position: integer('position').notNull(),
    actorId: uuid('actor_id').notNull(),
    decision: text('decision').$type<'approve' | 'reject'>().notNull(),
    reason: text('reason').default('').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    auditId: uuid('audit_id').notNull(),
    auditKey: text('audit_key').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.tenantId, t.idempotencyKey),
    unique().on(t.tenantId, t.propertyId, t.requestId, t.id),
    unique().on(t.tenantId, t.propertyId, t.requestId, t.position),
    foreignKey({
      columns: [t.tenantId, t.auditKey],
      foreignColumns: [auditLog.tenantId, auditLog.dedupKey],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.tenantId, t.propertyId, t.requestId, t.position, t.actorId],
      foreignColumns: [
        approvalStages.tenantId,
        approvalStages.propertyId,
        approvalStages.requestId,
        approvalStages.position,
        approvalStages.approverId,
      ],
    }).onDelete('restrict'),
    check('approval_decisions_decision_check', sql`${t.decision} IN ('approve','reject')`),
    check('approval_decisions_reason_check', sql`length(${t.reason}) <= 4000`),
    check(
      'approval_decisions_check',
      sql`${t.decision} <> 'reject' OR length(btrim(${t.reason})) > 0`,
    ),
  ],
)

export const approvalEvents = pgTable(
  'approval_events',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    propertyId: uuid('property_id').notNull(),
    requestId: uuid('request_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    kind: text('kind').$type<'submitted' | 'approve' | 'reject'>().notNull(),
    decisionId: uuid('decision_id').unique(),
    auditId: uuid('audit_id').notNull(),
    auditKey: text('audit_key').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.propertyId, t.requestId],
      foreignColumns: [approvalRequests.tenantId, approvalRequests.propertyId, approvalRequests.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.tenantId, t.actorId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.tenantId, t.auditKey],
      foreignColumns: [auditLog.tenantId, auditLog.dedupKey],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.tenantId, t.propertyId, t.requestId, t.decisionId],
      foreignColumns: [
        approvalDecisions.tenantId,
        approvalDecisions.propertyId,
        approvalDecisions.requestId,
        approvalDecisions.id,
      ],
    }).onDelete('restrict'),
    uniqueIndex('approval_events_submitted_ux')
      .on(t.tenantId, t.requestId)
      .where(sql`${t.kind}='submitted'`),
    check('approval_events_kind_check', sql`${t.kind} IN ('submitted','approve','reject')`),
    check('approval_events_check', sql`(${t.kind}='submitted')=(${t.decisionId} IS NULL)`),
  ],
)
