import { requireExportContext } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { isUuid } from '@/lib/list-params'
import { buildRiskRegisterCsv } from '@/lib/risk-reporting'
import { isRouterPrefetch } from '@/lib/router-prefetch'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  const ctx = await requireExportContext()
  const property = new URL(request.url).searchParams.get('property')
  if (property && !isUuid(property)) return Response.json({ error: 'Not found' }, { status: 404 })
  const body = await buildRiskRegisterCsv(ctx, property || undefined)
  await recordAudit(ctx, {
    entityType: 'risk_register',
    entityId: property || ctx.tenantId,
    action: 'export',
    summary: 'Exported Risk Register to CSV',
    metadata: { format: 'csv', propertyId: property },
  })
  return new Response(body, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="risk-register.csv"',
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}
