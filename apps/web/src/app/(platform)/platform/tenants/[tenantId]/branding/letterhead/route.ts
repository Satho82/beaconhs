import { notFound } from 'next/navigation'
import { isUuid } from '@/lib/list-params'
import { tenantBrandAssetResponse } from '../_asset-response'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  return tenantBrandAssetResponse(tenantId, 'letterhead')
}
