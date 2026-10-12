import { describe, expect, it } from 'vitest'
import { diaryRecurrenceCron, isOperationalTaskOverdue } from './diary-rules'

describe('hospitality diary recurrence and overdue rules', () => {
  it('maps the Phase 1 daily, weekly, and monthly forms to stable cron schedules', () => {
    expect(diaryRecurrenceCron({ recurrence: 'daily', dueTime: '09:00' })).toBe('0 9 * * *')
    expect(diaryRecurrenceCron({ recurrence: 'weekly', dueTime: '10:00', weekday: '1' })).toBe(
      '0 10 * * 1',
    )
    expect(diaryRecurrenceCron({ recurrence: 'monthly', dueTime: '09:00', monthDay: '1' })).toBe(
      '0 9 1 * *',
    )
  })

  it('identifies incomplete tasks after their due instant without marking completed tasks overdue', () => {
    const now = new Date('2026-09-12T12:00:00Z')
    expect(
      isOperationalTaskOverdue({ status: 'open', dueAt: new Date('2026-09-12T11:59:00Z') }, now),
    ).toBe(true)
    expect(
      isOperationalTaskOverdue(
        { status: 'completed', dueAt: new Date('2026-09-12T11:59:00Z') },
        now,
      ),
    ).toBe(false)
  })
})

describe('quarterly and yearly diary recurrence', () => {
  it('schedules calendar-quarter work and an explicit annual month', () => {
    expect(diaryRecurrenceCron({ recurrence: 'quarterly', dueTime: '09:30', monthDay: '15' })).toBe(
      '30 9 15 1,4,7,10 *',
    )
    expect(
      diaryRecurrenceCron({
        recurrence: 'yearly',
        dueTime: '08:45',
        monthDay: '28',
        annualMonth: '2',
      }),
    ).toBe('45 8 28 2 *')
  })

  it.each([undefined, '', '0', '13', '2.5', 'invalid'])(
    'rejects invalid annual month %s',
    (annualMonth) => {
      expect(() =>
        diaryRecurrenceCron({ recurrence: 'yearly', dueTime: '09:00', monthDay: '1', annualMonth }),
      ).toThrow(/month between 1 and 12/)
    },
  )

  it.each(['quarterly', 'yearly'] as const)(
    'rejects impossible calendar days for %s',
    (recurrence) => {
      for (const monthDay of ['0', '29', '31', '1.5', 'invalid']) {
        expect(() =>
          diaryRecurrenceCron({ recurrence, dueTime: '09:00', monthDay, annualMonth: '2' }),
        ).toThrow(/day between 1 and 28/)
      }
    },
  )

  it('rejects unsupported recurrence at the runtime boundary', () => {
    expect(() =>
      diaryRecurrenceCron({
        recurrence: 'hourly' as 'daily',
        dueTime: '09:00',
        monthDay: '1',
      }),
    ).toThrow(/Invalid diary recurrence/)
  })
})
