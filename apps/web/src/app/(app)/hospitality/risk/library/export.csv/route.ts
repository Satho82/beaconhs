import { requireExportContext } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { listRiskTemplates } from '@/lib/risk-assessments'
import { isRouterPrefetch } from '@/lib/router-prefetch'

function csv(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  const ctx = await requireExportContext()
  const templates = await listRiskTemplates(ctx)
  const body = [
    ['Title', 'Category', 'Version', 'State', 'Description', 'Hazards'].map(csv).join(','),
    ...templates.map((template) =>
      [
        template.title,
        template.category,
        template.version,
        template.state,
        template.description,
        template.hazards.map((hazard) => hazard.hazard).join('; '),
      ]
        .map(csv)
        .join(','),
    ),
  ].join('\r\n')
  await recordAudit(ctx, {
    entityType: 'risk_template',
    entityId: ctx.tenantId,
    action: 'export',
    summary: 'Exported Risk Library to CSV',
    metadata: { format: 'csv', count: templates.length },
  })
  return new Response(body, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="risk-library.csv"',
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}
