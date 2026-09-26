import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { id } from './_helpers'
import { users } from './core'

/** Deployment-wide audit evidence that deliberately has no tenant foreign key. */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: id(),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    action: text('action').notNull(),
    summary: text('summary'),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('platform_audit_log_occurred_idx').on(table.occurredAt)],
)
