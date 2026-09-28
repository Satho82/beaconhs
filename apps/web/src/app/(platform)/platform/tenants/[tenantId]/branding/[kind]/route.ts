import { notFound } from 'next/navigation'
import { tenantBrandAssetResponse } from '../_asset-response'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string; kind: string }> },
) {
  const { tenantId, kind } = await params
  if (kind !== 'logo' && kind !== 'letterhead') notFound()
  return tenantBrandAssetResponse(tenantId, kind)
}
