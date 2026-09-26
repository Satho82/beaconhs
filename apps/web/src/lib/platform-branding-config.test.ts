import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPlatformBranding: vi.fn(),
  savePlatformBranding: vi.fn(),
}))

vi.mock('@beaconhs/auth/platform-branding', () => ({
  getPlatformBranding: mocks.getPlatformBranding,
  savePlatformBranding: mocks.savePlatformBranding,
}))
vi.mock('@/components/brand-logo', () => ({ BrandSplash: () => null }))
vi.mock('@/components/brand-splash', () => ({ SplashHold: () => null }))

const originalNextPhase = process.env.NEXT_PHASE

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (originalNextPhase === undefined) delete process.env.NEXT_PHASE
  else process.env.NEXT_PHASE = originalNextPhase
})

describe('root platform branding boundary', () => {
  it('resolves the build-time root loading path without invoking the database reader', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    const [{ getRootPlatformBranding }, { default: RootLoading }] = await Promise.all([
      import('./platform-branding-config'),
      import('../app/loading'),
    ])

    await expect(getRootPlatformBranding()).resolves.toEqual({})
    await expect(RootLoading()).resolves.toBeDefined()
    expect(mocks.getPlatformBranding).not.toHaveBeenCalled()
  })

  it('uses database-backed platform branding during normal runtime', async () => {
    delete process.env.NEXT_PHASE
    const branding = { productName: 'Runtime Hotel Portal', primaryColor: '#123456' }
    mocks.getPlatformBranding.mockResolvedValueOnce(branding)
    const { getRootPlatformBranding } = await import('./platform-branding-config')

    await expect(getRootPlatformBranding()).resolves.toEqual(branding)
    expect(mocks.getPlatformBranding).toHaveBeenCalledOnce()
  })
})
