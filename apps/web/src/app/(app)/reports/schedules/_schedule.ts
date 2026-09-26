import { reportSchedules } from '@beaconhs/db/schema'
import type { ReportSchedule } from '@beaconhs/reports'

export function toSchedule(row: typeof reportSchedules.$inferSelect): ReportSchedule {
  return {
    schemaVersion: 1,
    id: row.id,
    definitionId: row.definitionId,
    name: row.name,
    active: row.active,
    cadence: row.cadence,
    timezone: row.timezone,
    hour: row.hour,
    minute: row.minute,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    weekOfMonth: row.weekOfMonth as 1 | 2 | 3 | 4 | 5 | null,
    repeatEvery: row.repeatEvery,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    recipientUserIds: row.recipientUserIds,
    recipientEmails: row.recipientEmails,
    filters: row.filters,
    emailSubject: row.emailSubject,
    emailMessage: row.emailMessage,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
  }
}
