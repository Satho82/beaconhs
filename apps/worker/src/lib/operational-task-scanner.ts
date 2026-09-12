// Durable operational-task occurrence materialisation. The unique database
// constraint on `(tenant_id, schedule_id, occurrence_at)` is the final
// idempotency boundary: overlapping ticks and retries can both plan a slot,
// but only one occurrence is persisted.

import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import {
  operationalTaskOccurrences,
  operationalTaskSchedules,
  operationalTaskTemplates,
  hospitalityProperties,
  tenantModuleEntitlements,
} from '@beaconhs/db/schema'
import {
  parseOperationalTaskRecurrence,
  planOperationalTaskOccurrences,
  type OperationalTaskSchedule,
} from './operational-task-schedule'

const SCHEDULE_BATCH_SIZE = 100
const OCCURRENCES_PER_SCHEDULE = 100

export type OperationalTaskScanResult = {
  schedules: number
  created: number
  errors: number
}

/**
 * Materialise a bounded backlog for every active operational task schedule.
 * It deliberately uses the tick's scheduled instant (not processing time) so
 * delayed BullMQ execution and retries do not skip a due minute.
 */
export async function scanOperationalTaskSchedules(
  now: Date = new Date(),
): Promise<OperationalTaskScanResult> {
  const schedules = await withSuperAdmin(db, (tx) =>
    tx
      .select({ schedule: operationalTaskSchedules })
      .from(operationalTaskSchedules)
      .innerJoin(
        tenantModuleEntitlements,
        and(
          eq(tenantModuleEntitlements.tenantId, operationalTaskSchedules.tenantId),
          eq(tenantModuleEntitlements.moduleKey, 'hospitality.diary'),
          eq(tenantModuleEntitlements.state, 'enabled'),
          or(isNull(tenantModuleEntitlements.effectiveFrom), lte(tenantModuleEntitlements.effectiveFrom, now)),
          or(isNull(tenantModuleEntitlements.effectiveUntil), gt(tenantModuleEntitlements.effectiveUntil, now)),
        ),
      )
      .innerJoin(
        operationalTaskTemplates,
        and(
          eq(operationalTaskTemplates.tenantId, operationalTaskSchedules.tenantId),
          eq(operationalTaskTemplates.id, operationalTaskSchedules.templateId),
        ),
      )
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, operationalTaskSchedules.tenantId),
          eq(hospitalityProperties.id, operationalTaskSchedules.propertyId),
        ),
      )
      .where(and(eq(operationalTaskSchedules.isActive, true), isNull(operationalTaskTemplates.deletedAt), isNull(hospitalityProperties.deletedAt)))
      .limit(SCHEDULE_BATCH_SIZE),
  )
  const result: OperationalTaskScanResult = { schedules: schedules.length, created: 0, errors: 0 }

  for (const { schedule } of schedules) {
    try {
      const recurrence = parseOperationalTaskRecurrence(schedule.recurrence)
      const created = await withSuperAdmin(db, async (tx) => {
        const [latest] = await tx
          .select({ occurrenceAt: operationalTaskOccurrences.occurrenceAt })
          .from(operationalTaskOccurrences)
          .where(
            and(
              eq(operationalTaskOccurrences.tenantId, schedule.tenantId),
              eq(operationalTaskOccurrences.scheduleId, schedule.id),
            ),
          )
          .orderBy(desc(operationalTaskOccurrences.occurrenceAt))
          .limit(1)

        const planned = planOperationalTaskOccurrences({
          schedule: {
            id: schedule.id,
            cron: recurrence.cron,
            timezone: schedule.timezone,
            activeFrom: schedule.startsAt,
            dueOffsetMinutes: recurrence.dueOffsetMinutes,
          } satisfies OperationalTaskSchedule,
          after: latest?.occurrenceAt ?? new Date(schedule.startsAt.getTime() - 1),
          through: now,
          limit: OCCURRENCES_PER_SCHEDULE,
        })
        if (planned.length === 0) return 0

        const inserted = await tx
          .insert(operationalTaskOccurrences)
          .values(
            planned.map((occurrence) => ({
              tenantId: schedule.tenantId,
              scheduleId: schedule.id,
              occurrenceAt: occurrence.scheduledAt,
              dueAt: occurrence.dueAt,
              assignedToTenantUserId: schedule.assignedToTenantUserId,
            })),
          )
          .onConflictDoNothing({
            target: [
              operationalTaskOccurrences.tenantId,
              operationalTaskOccurrences.scheduleId,
              operationalTaskOccurrences.occurrenceAt,
            ],
          })
          .returning({ id: operationalTaskOccurrences.id })
        return inserted.length
      })
      result.created += created
    } catch (error) {
      result.errors += 1
      console.error(`[operational-tasks] failed to materialise schedule ${schedule.id}`, error)
    }
  }
  return result
}
