import { describe, expect, it } from 'vitest'
import { isPlatformBrandAssetKey, platformBrandAssetUrl } from './platform-brand-asset-url'
import { validatePlatformBrandAsset } from './platform-brand-asset-validation'

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const jpeg = new Uint8Array([255, 216, 255, 0])
const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])
const ico = new Uint8Array([0, 0, 1, 0])

describe('platform branding asset validation', () => {
  it.each([
    ['image/png', png],
    ['image/jpeg', jpeg],
    ['image/webp', webp],
  ])('accepts a valid logo signature for %s', (contentType, bytes) => {
    expect(validatePlatformBrandAsset({ kind: 'logo', contentType, bytes })).toBeNull()
  })

  it.each([
    ['image/png', png],
    ['image/x-icon', ico],
    ['image/vnd.microsoft.icon', ico],
  ])('accepts a valid favicon signature for %s', (contentType, bytes) => {
    expect(validatePlatformBrandAsset({ kind: 'favicon', contentType, bytes })).toBeNull()
  })

  it('rejects unsupported types, mismatched bytes, and oversized files', () => {
    expect(
      validatePlatformBrandAsset({ kind: 'logo', contentType: 'image/svg+xml', bytes: png }),
    ).toMatch(/unsupported/i)
    expect(
      validatePlatformBrandAsset({ kind: 'favicon', contentType: 'image/jpeg', bytes: jpeg }),
    ).toMatch(/unsupported/i)
    expect(
      validatePlatformBrandAsset({ kind: 'logo', contentType: 'image/png', bytes: jpeg }),
    ).toMatch(/do not match/i)
    expect(
      validatePlatformBrandAsset({
        kind: 'logo',
        contentType: 'image/png',
        bytes: new Uint8Array(2 * 1024 * 1024 + 1),
      }),
    ).toMatch(/2 MB/i)
  })

  it('only creates public URLs for constrained, private branding keys', () => {
    const key = 'platform/branding/favicon/00000000-0000-0000-0000-000000000001.ico'
    expect(isPlatformBrandAssetKey(key)).toBe(true)
    expect(platformBrandAssetUrl('favicon', key)).toContain('/platform-branding/favicon?')
    expect(platformBrandAssetUrl('logo', 'storage://credentials')).toBeUndefined()
  })
})
