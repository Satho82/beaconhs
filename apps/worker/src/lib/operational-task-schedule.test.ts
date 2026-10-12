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
      after: new Date('2026-03-07T13:01:00.000Z'),
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
      schedule: {
        ...dailyToronto,
        timezone: 'UTC',
        dueOffsetMinutes: 0,
        activeFrom: new Date('2026-03-01T00:00:00.000Z'),
      },
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
    expect(() =>
      validateOperationalTaskSchedule({ ...dailyToronto, timezone: 'Not/AZone' }),
    ).toThrow(/timezone is invalid/)
    expect(() =>
      validateOperationalTaskSchedule({ ...dailyToronto, dueOffsetMinutes: -1 }),
    ).toThrow(/non-negative/)
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
    expect(() => parseOperationalTaskRecurrence({ dueOffsetMinutes: 30 })).toThrow(
      /cron is required/,
    )
    expect(() =>
      parseOperationalTaskRecurrence({ cron: '0 8 * * *', dueOffsetMinutes: 1.5 }),
    ).toThrow(/whole number/)
  })
})

describe('recurrence offset input boundary', () => {
  it.each([null, {}, '30', -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid offset %j',
    (dueOffsetMinutes) => {
      expect(() => parseOperationalTaskRecurrence({ cron: '0 8 * * *', dueOffsetMinutes })).toThrow(
        /due offset/,
      )
    },
  )
})

describe('London quarterly and yearly operational schedules', () => {
  it('keeps quarterly 09:30 local time across both London clock changes', () => {
    const slots = planOperationalTaskOccurrences({
      schedule: {
        ...dailyToronto,
        cron: '30 9 15 1,4,7,10 *',
        timezone: 'Europe/London',
        activeFrom: new Date('2026-01-01T00:00:00Z'),
        dueOffsetMinutes: 0,
      },
      after: new Date('2026-01-01T00:00:00Z'),
      through: new Date('2027-01-16T00:00:00Z'),
      limit: 10,
    })
    expect(slots.map((slot) => slot.scheduledAt.toISOString())).toEqual([
      '2026-01-15T09:30:00.000Z',
      '2026-04-15T08:30:00.000Z',
      '2026-07-15T08:30:00.000Z',
      '2026-10-15T08:30:00.000Z',
      '2027-01-15T09:30:00.000Z',
    ])
    expect(slots.every((slot) => slot.dueAt.getTime() === slot.scheduledAt.getTime())).toBe(true)
  })

  it('creates one yearly February occurrence in ordinary and leap years', () => {
    const slots = planOperationalTaskOccurrences({
      schedule: {
        ...dailyToronto,
        cron: '45 8 28 2 *',
        timezone: 'Europe/London',
        activeFrom: new Date('2026-01-01T00:00:00Z'),
        dueOffsetMinutes: 30,
      },
      after: new Date('2026-01-01T00:00:00Z'),
      through: new Date('2028-03-01T00:00:00Z'),
      limit: 10,
    })
    expect(slots.map((slot) => slot.scheduledAt.toISOString())).toEqual([
      '2026-02-28T08:45:00.000Z',
      '2027-02-28T08:45:00.000Z',
      '2028-02-28T08:45:00.000Z',
    ])
    expect(slots[0]?.dueAt.toISOString()).toBe('2026-02-28T09:15:00.000Z')
    expect(new Set(slots.map((slot) => slot.idempotencyKey)).size).toBe(3)
  })
})
