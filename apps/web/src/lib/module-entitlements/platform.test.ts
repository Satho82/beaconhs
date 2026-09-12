import { describe, expect, it } from 'vitest'
import { normalizeEntitlementChange } from './platform'

describe('platform entitlement changes', () => {
  it('only accepts catalogue keys and valid effective windows', () => {
    expect(normalizeEntitlementChange({ moduleKey: 'hospitality.properties', state: 'enabled' })).toMatchObject({ state: 'enabled' })
    expect(() => normalizeEntitlementChange({ moduleKey: 'hospitality.unknown', state: 'enabled' })).toThrow(/Unknown module/)
    expect(() => normalizeEntitlementChange({ moduleKey: 'hospitality.diary', state: 'active' })).toThrow(/enabled or disabled/)
    expect(() => normalizeEntitlementChange({ moduleKey: 'hospitality.diary', state: 'enabled', effectiveFrom: new Date('2026-01-02'), effectiveUntil: new Date('2026-01-01') })).toThrow(/end must be after/)
  })
})
