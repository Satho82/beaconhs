import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'
import { tenants, tenantUsers } from './core'
import { attachments } from './attachments'
import { hospitalityProperties, hospitalityRooms, maintenanceIssues } from './hospitality'
import { correctiveActions } from './corrective-actions'

// Text with explicit checks keeps the forward migration independent of enum mutation.
export const hospitalityHandovers = pgTable(
  'hospitality_handovers',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: uuid('property_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    shift: text('shift').$type<'am' | 'pm' | 'night' | 'custom'>().notNull(),
    customShift: text('custom_shift'),
    department: text('department').notNull(),
    note: text('note').notNull(),
    priority: text('priority').$type<'routine' | 'important' | 'urgent'>().notNull(),
    authorId: uuid('author_id').notNull(),
    roomId: uuid('room_id'),
    location: text('location'),
    followUpRequired: boolean('follow_up_required').default(false).notNull(),
    followUpOwnerId: uuid('follow_up_owner_id'),
    followUpStatus: text('follow_up_status')
      .$type<'not_required' | 'open' | 'in_progress' | 'completed'>()
      .default('not_required')
      .notNull(),
    carriedFromId: uuid('carried_from_id'),
    maintenanceIssueId: uuid('maintenance_issue_id'),
    correctiveActionId: uuid('corrective_action_id'),
    ...timestamps,
  },
  (t) => ({
    tenantIdId: uniqueIndex('hospitality_handovers_tenant_id_id_ux').on(t.tenantId, t.id),
    propertyIdId: uniqueIndex('hospitality_handovers_property_id_id_ux').on(
      t.tenantId,
      t.propertyId,
      t.id,
    ),
    feed: index('hospitality_handovers_feed_idx').on(t.tenantId, t.propertyId, t.occurredAt, t.id),
    followUp: index('hospitality_handovers_follow_up_idx').on(
      t.tenantId,
      t.propertyId,
      t.followUpStatus,
    ),
    carried: uniqueIndex('hospitality_handovers_carried_from_ux').on(t.tenantId, t.carriedFromId),
    property: foreignKey({
      name: 'handover_property_fk',
      columns: [t.tenantId, t.propertyId],
      foreignColumns: [hospitalityProperties.tenantId, hospitalityProperties.id],
    }),
    author: foreignKey({
      name: 'handover_author_fk',
      columns: [t.tenantId, t.authorId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    owner: foreignKey({
      name: 'handover_owner_fk',
      columns: [t.tenantId, t.followUpOwnerId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    room: foreignKey({
      name: 'handover_room_fk',
      columns: [t.tenantId, t.roomId],
      foreignColumns: [hospitalityRooms.tenantId, hospitalityRooms.id],
    }),
    carriedFrom: foreignKey({
      name: 'handover_carried_from_fk',
      columns: [t.tenantId, t.propertyId, t.carriedFromId],
      foreignColumns: [t.tenantId, t.propertyId, t.id],
    }),
    maintenance: foreignKey({
      name: 'handover_maintenance_fk',
      columns: [t.tenantId, t.maintenanceIssueId],
      foreignColumns: [maintenanceIssues.tenantId, maintenanceIssues.id],
    }),
    action: foreignKey({
      name: 'handover_action_fk',
      columns: [t.tenantId, t.correctiveActionId],
      foreignColumns: [correctiveActions.tenantId, correctiveActions.id],
    }),
    shiftCheck: check(
      'handover_shift_check',
      sql`${t.shift} IN ('am','pm','night','custom') AND (${t.shift} <> 'custom' OR length(trim(${t.customShift})) > 0 AND ${t.customShift} IS NOT NULL)`,
    ),
    priorityCheck: check(
      'handover_priority_check',
      sql`${t.priority} IN ('routine','important','urgent')`,
    ),
    noteCheck: check(
      'handover_note_check',
      sql`length(trim(${t.note})) BETWEEN 1 AND 10000 AND length(trim(${t.department})) BETWEEN 1 AND 100`,
    ),
    followUpCheck: check(
      'handover_follow_up_check',
      sql`(${t.followUpRequired} AND ${t.followUpStatus} IN ('open','in_progress','completed')) OR (NOT ${t.followUpRequired} AND ${t.followUpStatus} = 'not_required' AND ${t.followUpOwnerId} IS NULL)`,
    ),
  }),
)

export const hospitalityHandoverComments = pgTable(
  'hospitality_handover_comments',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    handoverId: uuid('handover_id').notNull(),
    authorId: uuid('author_id').notNull(),
    body: text('body').notNull(),
    ...timestamps,
  },
  (t) => ({
    feed: index('handover_comments_feed_idx').on(t.tenantId, t.handoverId, t.createdAt, t.id),
    handover: foreignKey({
      name: 'handover_comments_parent_fk',
      columns: [t.tenantId, t.handoverId],
      foreignColumns: [hospitalityHandovers.tenantId, hospitalityHandovers.id],
    }),
    author: foreignKey({
      name: 'handover_comments_author_fk',
      columns: [t.tenantId, t.authorId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    body: check('handover_comments_body_check', sql`length(trim(${t.body})) BETWEEN 1 AND 10000`),
  }),
)

export const hospitalityHandoverAcknowledgements = pgTable(
  'hospitality_handover_acknowledgements',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    handoverId: uuid('handover_id').notNull(),
    authorId: uuid('author_id').notNull(),
    ...timestamps,
  },
  (t) => ({
    unique: uniqueIndex('handover_acknowledgement_author_ux').on(
      t.tenantId,
      t.handoverId,
      t.authorId,
    ),
    handover: foreignKey({
      name: 'handover_acknowledgements_parent_fk',
      columns: [t.tenantId, t.handoverId],
      foreignColumns: [hospitalityHandovers.tenantId, hospitalityHandovers.id],
    }),
    author: foreignKey({
      name: 'handover_acknowledgements_author_fk',
      columns: [t.tenantId, t.authorId],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
  }),
)

export const hospitalityHandoverAttachments = pgTable(
  'hospitality_handover_attachments',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    handoverId: uuid('handover_id').notNull(),
    attachmentId: uuid('attachment_id').notNull(),
    uploadedById: uuid('uploaded_by_id').notNull(),
    ...timestamps,
  },
  (t) => ({
    unique: uniqueIndex('handover_attachment_ux').on(t.tenantId, t.handoverId, t.attachmentId),
    handover: foreignKey({
      name: 'handover_attachments_parent_fk',
      columns: [t.tenantId, t.handoverId],
      foreignColumns: [hospitalityHandovers.tenantId, hospitalityHandovers.id],
    }).onDelete('cascade'),
    attachment: foreignKey({
      name: 'handover_attachments_attachment_fk',
      columns: [t.tenantId, t.attachmentId],
      foreignColumns: [attachments.tenantId, attachments.id],
    }).onDelete('cascade'),
    uploader: foreignKey({
      name: 'handover_attachments_uploader_fk',
      columns: [t.tenantId, t.uploadedById],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    parent: index('handover_attachments_parent_idx').on(t.tenantId, t.handoverId),
  }),
)
