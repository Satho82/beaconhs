import { describe, expect, it } from 'vitest'
import { diaryRecurrenceCron, isOperationalTaskOverdue } from './diary'

describe('hospitality diary recurrence and overdue rules', () => {
  it('maps the Phase 1 daily, weekly, and monthly forms to stable cron schedules', () => {
    expect(diaryRecurrenceCron({ recurrence: 'daily', dueTime: '09:00' })).toBe('0 9 * * *')
    expect(diaryRecurrenceCron({ recurrence: 'weekly', dueTime: '10:00', weekday: '1' })).toBe('0 10 * * 1')
    expect(diaryRecurrenceCron({ recurrence: 'monthly', dueTime: '09:00', monthDay: '1' })).toBe('0 9 1 * *')
  })

  it('identifies incomplete tasks after their due instant without marking completed tasks overdue', () => {
    const now = new Date('2026-09-12T12:00:00Z')
    expect(isOperationalTaskOverdue({ status: 'open', dueAt: new Date('2026-09-12T11:59:00Z') }, now)).toBe(true)
    expect(isOperationalTaskOverdue({ status: 'completed', dueAt: new Date('2026-09-12T11:59:00Z') }, now)).toBe(false)
  })
})
