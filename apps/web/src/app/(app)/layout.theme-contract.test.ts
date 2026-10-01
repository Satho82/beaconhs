import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')

describe('authenticated tenant theme injection', () => {
  it('resolves the active tenant branding server-side into an allow-listed CSS variable', () => {
    expect(source).toContain('resolveTenantPrimaryAction(')
    expect(source).toContain("'--tenant-primary-action'")
    expect(source).toContain('tenant.branding.primaryColor')
    expect(source).toContain('platformBranding.primaryColor')
  })
})
