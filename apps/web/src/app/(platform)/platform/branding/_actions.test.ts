import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  auth: vi.fn(),
  deleteAsset: vi.fn(),
  getBranding: vi.fn(),
  revalidatePath: vi.fn(),
  saveBranding: vi.fn(),
  storeAsset: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
}))
vi.mock('@/lib/auth', () => ({ requirePlatformOperator: mocks.auth }))
vi.mock('@/lib/platform-audit', () => ({ recordPlatformAudit: mocks.audit }))
vi.mock('@/lib/platform-brand-assets', () => ({
  deletePlatformBrandAsset: mocks.deleteAsset,
  storePlatformBrandAsset: mocks.storeAsset,
}))
vi.mock('@/lib/platform-branding-config', () => ({
  getPlatformBranding: mocks.getBranding,
  savePlatformBranding: mocks.saveBranding,
}))

import { savePlatformBrandingAction } from './_actions'

function form(values: Record<string, string> = {}) {
  const result = new FormData()
  for (const [key, value] of Object.entries({
    productName: 'Uvanoo',
    primaryColor: '#1B2B4A',
    ...values,
  })) {
    result.set(key, value)
  }
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ userId: 'super-admin' })
  mocks.getBranding.mockResolvedValue({})
  mocks.saveBranding.mockResolvedValue(undefined)
  mocks.audit.mockResolvedValue(undefined)
  mocks.deleteAsset.mockResolvedValue(undefined)
})

describe('platform branding action', () => {
  it('enforces platform authorization on the server', async () => {
    mocks.auth.mockRejectedValue(new Error('Forbidden'))
    await expect(savePlatformBrandingAction(form())).rejects.toThrow('Forbidden')
    expect(mocks.saveBranding).not.toHaveBeenCalled()
  })

  it('rejects malformed Google Measurement IDs before saving', async () => {
    await expect(
      savePlatformBrandingAction(
        form({ analyticsEnabled: 'on', googleTagId: '<script>alert(1)</script>' }),
      ),
    ).rejects.toThrow('G-XXXXXXXXXX')
    expect(mocks.saveBranding).not.toHaveBeenCalled()
  })

  it('stores only normalized analytics configuration and records granular safe events', async () => {
    await savePlatformBrandingAction(form({ analyticsEnabled: 'on', googleTagId: 'g-safe1234' }))
    expect(mocks.saveBranding).toHaveBeenCalledWith(
      expect.objectContaining({ analytics: { enabled: true, googleTagId: 'G-SAFE1234' } }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(
      { userId: 'super-admin' },
      expect.objectContaining({ summary: 'm_c6d9e3a7b1f814' }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(
      { userId: 'super-admin' },
      expect.objectContaining({ summary: 'm_e8f2a5c9d3b036' }),
    )
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('G-SAFE1234')
  })

  it('resets legacy logo configuration to the default without retaining its URL', async () => {
    mocks.getBranding.mockResolvedValue({ logoUrl: 'https://legacy.example/logo.png' })
    await savePlatformBrandingAction(form({ resetLogo: '1' }))
    expect(mocks.saveBranding).toHaveBeenCalledWith(
      expect.objectContaining({ logoKey: undefined, logoUrl: undefined }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(
      { userId: 'super-admin' },
      expect.objectContaining({ summary: 'm_f3a6b9d4e7c581' }),
    )
  })
})
