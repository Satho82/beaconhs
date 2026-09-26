import { describe, expect, it } from 'vitest'
import { canTransitionIncident } from './lifecycle'

describe('incident lifecycle', () => {
  it('permits the investigation and review workflow', () => {
    expect(canTransitionIncident('reported', 'under_investigation')).toBe(true)
    expect(canTransitionIncident('under_investigation', 'pending_review')).toBe(true)
    expect(canTransitionIncident('pending_review', 'closed')).toBe(true)
    expect(canTransitionIncident('closed', 'reopened')).toBe(true)
    expect(canTransitionIncident('reopened', 'under_investigation')).toBe(true)
  })

  it('rejects skipped or unsafe transitions', () => {
    expect(canTransitionIncident('reported', 'closed')).toBe(false)
    expect(canTransitionIncident('under_investigation', 'reopened')).toBe(false)
    expect(canTransitionIncident('closed', 'pending_review')).toBe(false)
  })
})
