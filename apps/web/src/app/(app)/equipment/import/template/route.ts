import { requireRequestContext } from '@/lib/auth'
import { assertCan } from '@beaconhs/tenant'
import { assetImportTemplateCsv } from '@/lib/imports/assets-import'

export async function GET() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'equipment.manage')
  return new Response(assetImportTemplateCsv(), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="assets-import-template.csv"',
    'Cache-Control': 'private, no-store',
  }})
}