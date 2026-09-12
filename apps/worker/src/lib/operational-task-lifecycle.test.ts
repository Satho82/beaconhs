import { describe, expect, it } from 'vitest'
import { lifecycleStageForTask, OPERATIONAL_TASK_LIFECYCLE } from './operational-task-lifecycle'

describe('operational task lifecycle stages', () => {
  const now = new Date('2026-09-12T12:00:00Z')
  it('selects a single deterministic stage and skips completed tasks', () => {
    expect(lifecycleStageForTask({ status: 'open', dueAt: new Date('2026-09-12T12:30:00Z') }, now)).toBe('upcoming_reminder')
    expect(lifecycleStageForTask({ status: 'overdue', dueAt: new Date('2026-09-12T11:00:00Z') }, now)).toBe('overdue_notification')
    expect(lifecycleStageForTask({ status: 'completed', dueAt: new Date('2026-09-12T11:00:00Z') }, now)).toBeNull()
  })
  it('centralizes manager and final escalation thresholds', () => {
    expect(OPERATIONAL_TASK_LIFECYCLE.managerOverdueMinutes).toBeGreaterThan(0)
    expect(OPERATIONAL_TASK_LIFECYCLE.finalEscalationMinutes).toBeGreaterThan(OPERATIONAL_TASK_LIFECYCLE.managerOverdueMinutes)
  })
})
