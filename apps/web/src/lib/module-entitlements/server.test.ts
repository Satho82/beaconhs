import { describe, expect, it } from 'vitest'
import { isEntitlementEffective } from './server'

const NOW = new Date('2026-09-11T12:00:00.000Z')

describe('temporal module entitlement policy', () => {
  it('requires enabled state and a currently active window', () => {
    expect(
      isEntitlementEffective(
        { state: 'enabled', effectiveFrom: null, effectiveUntil: null },
        NOW,
      ),
    ).toBe(true)
    expect(
      isEntitlementEffective(
        { state: 'disabled', effectiveFrom: null, effectiveUntil: null },
        NOW,
      ),
    ).toBe(false)
  })

  it('honours future starts and exclusive ending instants', () => {
    expect(
      isEntitlementEffective(
        { state: 'enabled', effectiveFrom: new Date('2026-09-11T12:00:01Z'), effectiveUntil: null },
        NOW,
      ),
    ).toBe(false)
    expect(
      isEntitlementEffective(
        {
          state: 'enabled',
          effectiveFrom: new Date('2026-09-11T11:00:00Z'),
          effectiveUntil: new Date('2026-09-11T12:00:00Z'),
        },
        NOW,
      ),
    ).toBe(false)
  })
})
