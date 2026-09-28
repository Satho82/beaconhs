import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isTenantBrandAssetKey, tenantBrandAssetUrl } from './tenant-brand-asset-url'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const logo = `tenants/${tenantA}/branding/logo/33333333-3333-4333-8333-333333333333.png`
const letterhead = `tenants/${tenantA}/branding/letterhead/44444444-4444-4444-8444-444444444444.pdf`

describe('tenant branding delivery contract', () => {
  it('keeps branding keys constrained to their target tenant and asset kind', () => {
    expect(isTenantBrandAssetKey(tenantA, logo, 'logo')).toBe(true)
    expect(isTenantBrandAssetKey(tenantA, letterhead, 'letterhead')).toBe(true)
    expect(isTenantBrandAssetKey(tenantB, logo, 'logo')).toBe(false)
    expect(isTenantBrandAssetKey(tenantA, logo, 'letterhead')).toBe(false)
    expect(isTenantBrandAssetKey(tenantA, 'tenants/other/branding/logo/a.png')).toBe(false)
    expect(tenantBrandAssetUrl(tenantA, 'logo')).not.toContain(logo)
  })

  it('requires a platform operator and sends safe private responses', () => {
    const source = readFileSync(
      new URL(
        '../app/(platform)/platform/tenants/[tenantId]/branding/_asset-response.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toContain('requirePlatformOperator')
    expect(source).toContain("'Cache-Control': 'private, no-store'")
    expect(source).toContain("'X-Content-Type-Options': 'nosniff'")
    expect(source).toContain("'application/pdf'")
    expect(source).toContain('tenant-letterhead.pdf')
    expect(source).toContain('status: 404')
  })

  it('keeps the UI on secure same-origin URLs without displaying storage keys', () => {
    const source = readFileSync(
      new URL('../app/(platform)/platform/tenants/[tenantId]/branding/page.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toContain('tenantBrandAssetUrl')
    expect(source).not.toContain('branding.logoUrl ??')
    expect(source).not.toContain('branding.pdfLetterhead ??')
  })
})
