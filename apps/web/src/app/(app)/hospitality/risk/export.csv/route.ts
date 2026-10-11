import { requireExportContext } from '@/lib/auth'
import { riskExportResponse } from '@/lib/risk-export-response'
import { recordAudit } from '@/lib/audit'
import { isUuid } from '@/lib/list-params'
import { buildRiskRegisterCsv } from '@/lib/risk-reporting'
import { isRouterPrefetch } from '@/lib/router-prefetch'
import { isRiskSchemaReady, riskSchemaUnavailableResponse } from '@/lib/risk-schema-readiness'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  return riskExportResponse(() => exportCsv(request))
}

async function exportCsv(request: Request) {
  const ctx = await requireExportContext()
  if (!(await isRiskSchemaReady(ctx))) return riskSchemaUnavailableResponse()
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
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
