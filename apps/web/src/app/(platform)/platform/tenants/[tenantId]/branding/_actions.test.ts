import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('tenant branding action contract', () => {
  const source = readFileSync(new URL('./_actions.ts', import.meta.url), 'utf8')

  it('requires platform authorization and server-validates the target tenant', () => {
    expect(source).toContain('requirePlatformOperator')
    expect(source).toContain('isUuid(tenantId)')
    expect(source).toContain('withSuperAdmin')
  })

  it('uses the tenant-scoped asset service and preserves unrelated branding configuration', () => {
    expect(source).toContain('storeTenantBrandAsset')
    expect(source).toContain('deleteTenantBrandAsset')
    expect(source).toContain('...old')
    expect(source).toContain("tenantId, kind: 'logo'")
    expect(source).toContain("tenantId, kind: 'letterhead'")
  })

  it('validates HEX, audits changes, and returns safe UI outcomes', () => {
    expect(source).toContain('const HEX')
    expect(source).toContain("outcome: 'invalid_hex'")
    expect(source).toContain("outcome: 'invalid_asset'")
    expect(source).toContain('recordPlatformAudit')
    expect(source).not.toContain('error.stack')
  })
})
