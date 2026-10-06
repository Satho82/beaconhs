import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { readTenantBrandAsset } from '@/lib/tenant-brand-assets'
import { isTenantBrandAssetKey } from '@/lib/tenant-brand-asset-url'
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (kind !== 'logo' && kind !== 'letterhead') return new Response(null, { status: 404 })
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ branding: tenants.branding })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1),
  )
  const key = kind === 'logo' ? tenant?.branding.logoUrl : tenant?.branding.pdfLetterhead
  if (!isTenantBrandAssetKey(ctx.tenantId, key, kind)) return new Response(null, { status: 404 })
  const asset = await readTenantBrandAsset(ctx.tenantId, kind, key)
  if (!asset) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(asset), {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type':
        kind === 'letterhead'
          ? 'application/pdf'
          : key.endsWith('.jpg')
            ? 'image/jpeg'
            : key.endsWith('.webp')
              ? 'image/webp'
              : 'image/png',
      'Content-Disposition':
        kind === 'letterhead' ? 'attachment; filename="tenant-letterhead.pdf"' : 'inline',
    },
  })
}
