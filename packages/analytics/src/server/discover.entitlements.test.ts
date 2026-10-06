import { describe, expect, it } from 'vitest'
import { filterComplianceEntities, discoverEntities } from './discover'
describe('Compliance report and Insights source access', () => {
  it('removes all Compliance storage and every incoming join when disabled', () => {
    const original = discoverEntities()
    expect(original.some((e) => e.key === 'compliance_obligations')).toBe(true)
    const allowed = filterComplianceEntities(original, false)
    expect(allowed.some((e) => e.table.startsWith('compliance_'))).toBe(false)
    expect(
      allowed.flatMap((e) => e.relations ?? []).some((r) => r.target.startsWith('compliance_')),
    ).toBe(false)
    expect(allowed.some((e) => e.table === 'people')).toBe(true)
    expect(allowed.some((e) => e.table === 'equipment_items')).toBe(true)
  })
  it('retains the entitled catalogue without mutating cached source discovery', () => {
    const original = discoverEntities()
    filterComplianceEntities(original, false)
    expect(filterComplianceEntities(original, true).map((e) => e.key)).toEqual(
      original.map((e) => e.key),
    )
    expect(original.some((e) => e.key === 'compliance_obligations')).toBe(true)
  })
})
