import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { readPlatformBrandAsset } from '@/lib/platform-brand-assets'

export async function GET(): Promise<Response> {
  try {
    const branding = await getPlatformBranding()
    const icon = await readPlatformBrandAsset(branding.faviconKey)
    if (icon) {
      return new Response(new Uint8Array(icon), {
        headers: {
          'Content-Type': branding.faviconContentType ?? 'image/png',
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
  } catch {
    // Database or storage failures must never remove the built-in favicon.
  }
  const icon = await readFile(join(process.cwd(), 'src/app/icon.png'))

  return new Response(icon, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
