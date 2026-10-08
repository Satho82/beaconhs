import { eq } from 'drizzle-orm'
import { tenants } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { readTenantBrandAsset } from '@/lib/tenant-brand-assets'
import { isTenantBrandAssetKey } from '@/lib/tenant-brand-asset-url'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireRequestContext()
  const [tenant] = await ctx.db((tx) =>
    tx
      .select({ branding: tenants.branding })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1),
  )
  const key = tenant?.branding.logoUrl
  if (!isTenantBrandAssetKey(ctx.tenantId, key, 'logo')) return new Response(null, { status: 404 })
  const bytes = await readTenantBrandAsset(ctx.tenantId, 'logo', key)
  if (!bytes) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': key.endsWith('.jpg')
        ? 'image/jpeg'
        : key.endsWith('.webp')
          ? 'image/webp'
          : 'image/png',
    },
  })
}
