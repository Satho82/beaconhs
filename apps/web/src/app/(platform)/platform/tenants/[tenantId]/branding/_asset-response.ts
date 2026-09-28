import 'server-only'

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { readTenantBrandAsset } from '@/lib/tenant-brand-assets'
import { isTenantBrandAssetKey, type TenantBrandAssetKind } from '@/lib/tenant-brand-asset-url'

function notFound() {
  return new NextResponse(null, { status: 404 })
}

export async function tenantBrandAssetResponse(
  tenantId: string,
  kind: TenantBrandAssetKind,
): Promise<Response> {
  await requirePlatformOperator()
  if (!isUuid(tenantId)) return notFound()

  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ branding: tenants.branding })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  )
  if (!tenant) return notFound()
  const key = kind === 'logo' ? tenant.branding.logoUrl : tenant.branding.pdfLetterhead
  if (!isTenantBrandAssetKey(tenantId, key, kind)) return notFound()
  const asset = await readTenantBrandAsset(tenantId, kind, key)
  if (!asset) return notFound()

  const headers: Record<string, string> = {
    'Cache-Control': 'private, no-store',
    'Content-Type':
      kind === 'letterhead'
        ? 'application/pdf'
        : key.endsWith('.jpg')
          ? 'image/jpeg'
          : key.endsWith('.webp')
            ? 'image/webp'
            : 'image/png',
    'X-Content-Type-Options': 'nosniff',
  }
  if (kind === 'letterhead')
    headers['Content-Disposition'] = 'inline; filename="tenant-letterhead.pdf"'
  return new NextResponse(new Uint8Array(asset), { headers })
}
