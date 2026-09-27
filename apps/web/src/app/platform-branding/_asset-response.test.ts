import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getBranding: vi.fn(), readAsset: vi.fn() }))

vi.mock('@/lib/platform-branding-config', () => ({ getPlatformBranding: mocks.getBranding }))
vi.mock('@/lib/platform-brand-assets', () => ({ readPlatformBrandAsset: mocks.readAsset }))

import { platformBrandAssetResponse } from './_asset-response'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getBranding.mockResolvedValue({
    logoKey: 'platform/branding/logo/00000000-0000-0000-0000-000000000001.png',
    faviconKey: 'platform/branding/favicon/00000000-0000-0000-0000-000000000001.ico',
    faviconContentType: 'image/x-icon',
  })
})

describe('private platform brand asset responses', () => {
  it('serves a configured favicon with safe headers', async () => {
    mocks.readAsset.mockResolvedValue(Buffer.from([0, 0, 1, 0]))
    const response = await platformBrandAssetResponse('favicon')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/x-icon')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.readAsset).toHaveBeenCalledWith(expect.stringContaining('/favicon/'))
  })

  it('returns a body-free 404 when the configured asset is missing', async () => {
    mocks.readAsset.mockResolvedValue(null)
    const response = await platformBrandAssetResponse('logo')
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('platform/branding')
  })
})
