import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/module-entitlements/server', () => ({
  assertTenantModuleEntitled: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }))

import { canTransitionMaintenanceIssue } from './maintenance'

describe('hotel maintenance lifecycle', () => {
  it('supports the operational happy path', () => {
    expect(canTransitionMaintenanceIssue('reported', 'acknowledged')).toBe(true)
    expect(canTransitionMaintenanceIssue('acknowledged', 'assigned')).toBe(true)
    expect(canTransitionMaintenanceIssue('assigned', 'in_progress')).toBe(true)
    expect(canTransitionMaintenanceIssue('in_progress', 'awaiting_parts')).toBe(true)
    expect(canTransitionMaintenanceIssue('awaiting_parts', 'completed')).toBe(true)
    expect(canTransitionMaintenanceIssue('completed', 'closed')).toBe(true)
  })

  it('blocks unsafe lifecycle jumps and reopening a closed issue', () => {
    expect(canTransitionMaintenanceIssue('reported', 'completed')).toBe(false)
    expect(canTransitionMaintenanceIssue('closed', 'in_progress')).toBe(false)
  })

  it('allows corrections and legacy records to enter the new lifecycle', () => {
    expect(canTransitionMaintenanceIssue('completed', 'in_progress')).toBe(true)
    expect(canTransitionMaintenanceIssue('cancelled', 'reported')).toBe(true)
    expect(canTransitionMaintenanceIssue('triaged', 'assigned')).toBe(true)
    expect(canTransitionMaintenanceIssue('work_ordered', 'in_progress')).toBe(true)
  })
})
