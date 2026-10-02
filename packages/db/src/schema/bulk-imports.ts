import { relations } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'
import { attachments } from './attachments'
import { tenants, users } from './core'

export const bulkImportStatus = pgEnum('bulk_import_status', [
  'received',
  'parsed',
  'ready_for_confirmation',
  'processing',
  'completed',
  'failed',
  'cancelled',
])

export const bulkImportRowStatus = pgEnum('bulk_import_row_status', [
  'accepted',
  'rejected',
  'warning',
  'duplicate',
  'created',
  'updated',
  'skipped',
])

/** A tenant-bound, immutable-preview import batch. Operational writes begin only after confirmation. */
export const bulkImportBatches = pgTable(
  'bulk_import_batches',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    datasetKey: text('dataset_key').notNull(),
    sourceAttachmentId: uuid('source_attachment_id'),
    sourceDigest: text('source_digest').notNull(),
    status: bulkImportStatus('status').default('received').notNull(),
    validationSummary: jsonb('validation_summary')
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    failureReason: text('failure_reason'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    confirmedByUserId: text('confirmed_by_user_id').references(() => users.id),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    processingAt: timestamp('processing_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    tenantStatusIdx: index('bulk_import_batches_tenant_status_idx').on(
      t.tenantId,
      t.status,
      t.createdAt,
    ),
    tenantDatasetIdx: index('bulk_import_batches_tenant_dataset_idx').on(
      t.tenantId,
      t.datasetKey,
      t.createdAt,
    ),
    sourceAttachmentFk: foreignKey({
      name: 'bulk_import_batches_tenant_source_attachment_fk',
      columns: [t.tenantId, t.sourceAttachmentId],
      foreignColumns: [attachments.tenantId, attachments.id],
    }).onDelete('set null'),
  }),
)

/** Parsed, mapped, and final row outcomes. Raw source is retained only in the private tenant batch. */
export const bulkImportRows = pgTable(
  'bulk_import_rows',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').notNull(),
    sourceRowNumber: integer('source_row_number').notNull(),
    rawValues: jsonb('raw_values').$type<Record<string, string>>().default({}).notNull(),
    mappedValues: jsonb('mapped_values').$type<Record<string, unknown>>().default({}).notNull(),
    issues: jsonb('issues')
      .$type<Array<{ severity: 'error' | 'warning'; message: string }>>()
      .default([])
      .notNull(),
    duplicateReference: text('duplicate_reference'),
    proposedAction: text('proposed_action').notNull(),
    finalAction: text('final_action'),
    status: bulkImportRowStatus('status').default('accepted').notNull(),
    ...timestamps,
  },
  (t) => ({
    batchRowUx: uniqueIndex('bulk_import_rows_batch_row_ux').on(t.batchId, t.sourceRowNumber),
    tenantBatchIdx: index('bulk_import_rows_tenant_batch_idx').on(t.tenantId, t.batchId),
    batchFk: foreignKey({
      name: 'bulk_import_rows_tenant_batch_fk',
      columns: [t.tenantId, t.batchId],
      foreignColumns: [bulkImportBatches.tenantId, bulkImportBatches.id],
    }).onDelete('cascade'),
  }),
)

export const bulkImportBatchesRelations = relations(bulkImportBatches, ({ many }) => ({
  rows: many(bulkImportRows),
}))

export const bulkImportRowsRelations = relations(bulkImportRows, ({ one }) => ({
  batch: one(bulkImportBatches, {
    fields: [bulkImportRows.tenantId, bulkImportRows.batchId],
    references: [bulkImportBatches.tenantId, bulkImportBatches.id],
  }),
}))
