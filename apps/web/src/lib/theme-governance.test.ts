import { describe, expect, it } from 'vitest'
import { resolveTenantPrimaryAction } from './theme-governance'

describe('tenant theme governance', () => {
  it('uses a valid tenant override without mutating the platform default', () => {
    expect(resolveTenantPrimaryAction('#123456', '#abcdef')).toBe('#ABCDEF')
  })

  it('falls back to the platform default and rejects invalid colours', () => {
    expect(resolveTenantPrimaryAction('#123456', 'orange')).toBe('#123456')
    expect(resolveTenantPrimaryAction(undefined, undefined)).toBe('#0F766E')
  })
})
