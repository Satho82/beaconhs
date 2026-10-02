import { requireRequestContext } from '@/lib/auth'
import { assertCan } from '@beaconhs/tenant'
import { propertyStructureTemplateCsv } from '@/lib/imports/property-structure'
export async function GET() { const ctx = await requireRequestContext(); assertCan(ctx, 'admin.settings.manage'); return new Response(propertyStructureTemplateCsv(), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="property-structure-template.csv"', 'Cache-Control': 'private, no-store' } }) }
