import { NextResponse } from 'next/server'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { readPlatformBrandAsset } from '@/lib/platform-brand-assets'
import type { PlatformBrandAssetKind } from '@/lib/platform-brand-asset-url'

function assetContentType(kind: PlatformBrandAssetKind, key: string | undefined, faviconType?: string) {
  if (kind === 'favicon') return faviconType ?? 'image/png'
  if (key?.endsWith('.jpg')) return 'image/jpeg'
  if (key?.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

export async function platformBrandAssetResponse(kind: PlatformBrandAssetKind): Promise<Response> {
  const branding = await getPlatformBranding()
  const key = kind === 'logo' ? branding.logoKey : branding.faviconKey
  const asset = await readPlatformBrandAsset(key)
  if (!asset) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(asset), {
    headers: {
      'Content-Type': assetContentType(kind, key, branding.faviconContentType),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
