import { describe, expect, it } from 'vitest'
import { isNavModuleEntitled } from './entitlements'

describe('module entitlement navigation filter', () => {
  it('hides Compliance independently of every other module', () => {
    expect(
      isNavModuleEntitled(
        'compliance',
        new Set([
          'hospitality.properties',
          'hospitality.maintenance',
          'hospitality.diary',
          'hospitality.manager-signoff',
        ]),
      ),
    ).toBe(false)
    expect(isNavModuleEntitled('compliance', new Set(['hospitality.compliance']))).toBe(true)
  })

  it('hides Maintenance when its entitlement is absent, including when Properties is enabled', () => {
    expect(isNavModuleEntitled('hospitality-maintenance', new Set())).toBe(false)
    expect(
      isNavModuleEntitled('hospitality-maintenance', new Set(['hospitality.properties'])),
    ).toBe(false)
  })

  it('allows Maintenance through the entitlement filter when enabled, leaving RBAC to the resolver', () => {
    expect(
      isNavModuleEntitled('hospitality-maintenance', new Set(['hospitality.maintenance'])),
    ).toBe(true)
  })

  it('does not restore hospitality from a tenant navigation preference when its module is disabled', () => {
    expect(isNavModuleEntitled('hospitality', new Set())).toBe(false)
    expect(isNavModuleEntitled('hospitality', new Set(['hospitality.properties']))).toBe(true)
  })
})
