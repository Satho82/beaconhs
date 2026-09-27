export type PlatformBrandAssetKind = 'logo' | 'favicon'

export function isPlatformBrandAssetKey(key: string | undefined): key is string {
  return Boolean(
    key && /^platform\/branding\/(logo|favicon)\/[0-9a-f-]{36}\.(png|jpg|webp|ico)$/.test(key),
  )
}

export function platformBrandAssetUrl(
  kind: PlatformBrandAssetKind,
  key: string | undefined,
): string | undefined {
  return isPlatformBrandAssetKey(key)
    ? `/platform-branding/${kind}?v=${encodeURIComponent(key)}`
    : undefined
}
