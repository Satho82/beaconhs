import { NextResponse } from 'next/server'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { readPlatformBrandAsset } from '@/lib/platform-brand-assets'
import type { PlatformBrandAssetKind } from '@/lib/platform-brand-asset-url'

export async function platformBrandAssetResponse(kind: PlatformBrandAssetKind): Promise<Response> {
  const branding = await getPlatformBranding()
  const key = kind === 'logo' ? branding.logoKey : branding.faviconKey
  const asset = await readPlatformBrandAsset(key)
  if (!asset) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(asset), {
    headers: {
      'Content-Type':
        kind === 'favicon' ? (branding.faviconContentType ?? 'image/png') : 'image/png',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
