import { platformBrandAssetResponse } from '../_asset-response'

export const dynamic = 'force-dynamic'

export function GET() {
  return platformBrandAssetResponse('favicon')
}
