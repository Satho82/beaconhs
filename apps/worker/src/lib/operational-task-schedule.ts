import { nextCronAfter, parseCron } from './cron'

/**
 * The persisted schedule fields needed to materialise operational task
 * occurrences. This intentionally has no database dependency: the repository
 * owns locking and the unique `(schedule_id, scheduled_at)` constraint.
 */
export type OperationalTaskSchedule = {
  id: string
  cron: string
  timezone: string
  activeFrom: Date
  activeUntil?: Date | null
  dueOffsetMinutes?: number | null
}

/** Persisted in `operational_task_schedules.recurrence`. */
export type OperationalTaskRecurrence = {
  cron: string
  dueOffsetMinutes?: number
}

export type PlannedTaskOccurrence = {
  scheduledAt: Date
  dueAt: Date
  /** Stable across scanner retries and worker deployments. */
  idempotencyKey: string
}

export type PlanTaskOccurrencesInput = {
  schedule: OperationalTaskSchedule
  /** The exclusive materialisation cursor, normally the last created slot. */
  after: Date
  /** Include slots at or before this scanner tick's scheduled instant. */
  through: Date
  /** Bound catch-up work; the caller persists the returned final cursor. */
  limit: number
}

function assertValidDate(value: Date, name: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${name} must be a valid date`)
  }
}

function validateTimezone(timezone: string): string {
  const normalized = timezone.trim()
  if (!normalized) throw new Error('Task schedule timezone is required')
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: normalized }).format(new Date(0))
  } catch {
    throw new Error(`Task schedule timezone is invalid: ${timezone}`)
  }
  return normalized
}

function dueOffsetMilliseconds(value: number | null | undefined): number {
  const minutes = value ?? 0
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new Error('Task schedule due offset must be a non-negative whole number of minutes')
  }
  return minutes * 60_000
}

/**
 * Decode the JSON recurrence at the persistence boundary. Keeping this narrow
 * makes unsupported recurrence variants fail visibly instead of silently
 * producing an incorrect operational obligation.
 */
export function parseOperationalTaskRecurrence(value: Record<string, unknown>): OperationalTaskRecurrence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Task schedule recurrence must be an object')
  }
  const cron = value.cron
  if (typeof cron !== 'string' || !cron.trim()) {
    throw new Error('Task schedule recurrence cron is required')
  }
  const dueOffsetMinutes = value.dueOffsetMinutes
  if (dueOffsetMinutes !== undefined && !Number.isSafeInteger(dueOffsetMinutes)) {
    throw new Error('Task schedule due offset must be a whole number of minutes')
  }
  return { cron, ...(dueOffsetMinutes === undefined ? {} : { dueOffsetMinutes }) }
}

/**
 * Validates a schedule before it is persisted. A cron is evaluated in the
 * property timezone, while every occurrence is persisted as a UTC instant.
 */
export function validateOperationalTaskSchedule(schedule: OperationalTaskSchedule): void {
  if (!schedule.id.trim()) throw new Error('Task schedule id is required')
  assertValidDate(schedule.activeFrom, 'Task schedule activeFrom')
  if (schedule.activeUntil) {
    assertValidDate(schedule.activeUntil, 'Task schedule activeUntil')
    if (schedule.activeUntil.getTime() < schedule.activeFrom.getTime()) {
      throw new Error('Task schedule activeUntil must not be before activeFrom')
    }
  }
  const timezone = validateTimezone(schedule.timezone)
  const cron = parseCron(schedule.cron)
  // This also validates the expression against the requested IANA timezone.
  if (!nextCronAfter(cron, new Date(schedule.activeFrom.getTime() - 1), timezone)) {
    throw new Error('Task schedule has no future occurrence')
  }
  dueOffsetMilliseconds(schedule.dueOffsetMinutes)
}

/**
 * Materialise a bounded sequence of missed and current slots. The database
 * must atomically insert each result with a unique `(schedule_id,
 * scheduled_at)` key. That constraint, not an in-memory cursor, makes retries
 * and concurrent scanners duplicate-safe.
 */
export function planOperationalTaskOccurrences({
  schedule,
  after,
  through,
  limit,
}: PlanTaskOccurrencesInput): PlannedTaskOccurrence[] {
  validateOperationalTaskSchedule(schedule)
  assertValidDate(after, 'Task occurrence cursor')
  assertValidDate(through, 'Task occurrence scan time')
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('Task occurrence limit must be a positive whole number')
  }
  if (through.getTime() <= after.getTime()) return []

  const activeUntil = schedule.activeUntil ?? null
  if (activeUntil && after.getTime() >= activeUntil.getTime()) return []

  const cron = parseCron(schedule.cron)
  const timezone = validateTimezone(schedule.timezone)
  const earliestCursor = new Date(schedule.activeFrom.getTime() - 1)
  let cursor = new Date(Math.max(after.getTime(), earliestCursor.getTime()))
  const dueOffset = dueOffsetMilliseconds(schedule.dueOffsetMinutes)
  const occurrences: PlannedTaskOccurrence[] = []

  while (occurrences.length < limit) {
    const scheduledAt = nextCronAfter(cron, cursor, timezone)
    if (!scheduledAt || scheduledAt.getTime() > through.getTime()) break
    if (activeUntil && scheduledAt.getTime() > activeUntil.getTime()) break

    occurrences.push({
      scheduledAt,
      dueAt: new Date(scheduledAt.getTime() + dueOffset),
      idempotencyKey: operationalTaskOccurrenceKey(schedule.id, scheduledAt),
    })
    cursor = scheduledAt
  }
  return occurrences
}

/** A database-safe, deterministic identity for queue and outbox publication. */
export function operationalTaskOccurrenceKey(scheduleId: string, scheduledAt: Date): string {
  if (!scheduleId.trim()) throw new Error('Task schedule id is required')
  assertValidDate(scheduledAt, 'Task occurrence scheduledAt')
  return `operational-task-occurrence|${scheduleId}|${scheduledAt.toISOString()}`
}
