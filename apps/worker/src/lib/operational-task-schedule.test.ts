import { describe, expect, it } from 'vitest'
import {
  operationalTaskOccurrenceKey,
  parseOperationalTaskRecurrence,
  planOperationalTaskOccurrences,
  validateOperationalTaskSchedule,
  type OperationalTaskSchedule,
} from './operational-task-schedule'

const dailyToronto: OperationalTaskSchedule = {
  id: 'a882a98b-4d0c-4727-8f2f-9e62b14d7baa',
  cron: '0 8 * * *',
  timezone: 'America/Toronto',
  activeFrom: new Date('2026-03-06T00:00:00.000Z'),
  dueOffsetMinutes: 90,
}

describe('operational task occurrence planner', () => {
  it('keeps the configured local time across spring DST and calculates due time from the instant', () => {
    const slots = planOperationalTaskOccurrences({
      schedule: dailyToronto,
      after: new Date('2026-03-07T12:01:00.000Z'),
      through: new Date('2026-03-09T13:00:00.000Z'),
      limit: 10,
    })

    expect(slots.map((slot) => slot.scheduledAt.toISOString())).toEqual([
      '2026-03-08T12:00:00.000Z',
      '2026-03-09T12:00:00.000Z',
    ])
    expect(slots[0]?.dueAt.toISOString()).toBe('2026-03-08T13:30:00.000Z')
  })

  it('plans missed occurrences in order and caps catch-up work', () => {
    const slots = planOperationalTaskOccurrences({
      schedule: { ...dailyToronto, timezone: 'UTC', dueOffsetMinutes: 0 },
      after: new Date('2026-03-01T00:00:00.000Z'),
      through: new Date('2026-03-10T12:00:00.000Z'),
      limit: 3,
    })

    expect(slots.map((slot) => slot.scheduledAt.toISOString())).toEqual([
      '2026-03-01T08:00:00.000Z',
      '2026-03-02T08:00:00.000Z',
      '2026-03-03T08:00:00.000Z',
    ])
  })

  it('honours activation and end boundaries without creating a pre-activation occurrence', () => {
    const slots = planOperationalTaskOccurrences({
      schedule: {
        ...dailyToronto,
        timezone: 'UTC',
        activeFrom: new Date('2026-03-03T09:00:00.000Z'),
        activeUntil: new Date('2026-03-05T08:00:00.000Z'),
      },
      after: new Date('2026-03-01T00:00:00.000Z'),
      through: new Date('2026-03-10T00:00:00.000Z'),
      limit: 10,
    })

    expect(slots.map((slot) => slot.scheduledAt.toISOString())).toEqual([
      '2026-03-04T08:00:00.000Z',
      '2026-03-05T08:00:00.000Z',
    ])
  })

  it('uses stable keys, allowing a database uniqueness constraint to make retries idempotent', () => {
    const scheduledAt = new Date('2026-03-08T12:00:00.000Z')
    expect(operationalTaskOccurrenceKey(dailyToronto.id, scheduledAt)).toBe(
      'operational-task-occurrence|a882a98b-4d0c-4727-8f2f-9e62b14d7baa|2026-03-08T12:00:00.000Z',
    )
    expect(
      planOperationalTaskOccurrences({
        schedule: dailyToronto,
        after: new Date('2026-03-08T11:00:00.000Z'),
        through: new Date('2026-03-08T12:00:00.000Z'),
        limit: 1,
      })[0]?.idempotencyKey,
    ).toBe(operationalTaskOccurrenceKey(dailyToronto.id, scheduledAt))
  })

  it('rejects invalid timezone, offset, and activation bounds before scanning', () => {
    expect(() => validateOperationalTaskSchedule({ ...dailyToronto, timezone: 'Not/AZone' })).toThrow(
      /timezone is invalid/,
    )
    expect(() => validateOperationalTaskSchedule({ ...dailyToronto, dueOffsetMinutes: -1 })).toThrow(
      /non-negative/,
    )
    expect(() =>
      validateOperationalTaskSchedule({
        ...dailyToronto,
        activeUntil: new Date('2026-03-05T00:00:00.000Z'),
      }),
    ).toThrow(/must not be before/)
  })

  it('decodes only a valid persisted recurrence shape', () => {
    expect(parseOperationalTaskRecurrence({ cron: '0 8 * * *', dueOffsetMinutes: 30 })).toEqual({
      cron: '0 8 * * *',
      dueOffsetMinutes: 30,
    })
    expect(() => parseOperationalTaskRecurrence({ dueOffsetMinutes: 30 })).toThrow(/cron is required/)
    expect(() => parseOperationalTaskRecurrence({ cron: '0 8 * * *', dueOffsetMinutes: 1.5 })).toThrow(
      /whole number/,
    )
  })
})
