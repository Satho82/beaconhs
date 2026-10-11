import { requireExportContext } from '@/lib/auth'
import { riskExportResponse } from '@/lib/risk-export-response'
import { recordAudit } from '@/lib/audit'
import { isUuid } from '@/lib/list-params'
import { renderOnDemandPdfResponse } from '@/lib/pdf-route'
import { riskPdfAttachmentResponse } from '@/lib/risk-pdf-response'
import { buildRiskRegisterHtml } from '@/lib/risk-reporting'
import { isRouterPrefetch } from '@/lib/router-prefetch'
import { isRiskSchemaReady, riskSchemaUnavailableResponse } from '@/lib/risk-schema-readiness'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  return riskExportResponse(async () => {
    const ctx = await requireExportContext()
    if (!(await isRiskSchemaReady(ctx))) return riskSchemaUnavailableResponse()
    const property = new URL(request.url).searchParams.get('property')
    if (property && !isUuid(property)) return Response.json({ error: 'Not found' }, { status: 404 })
    const html = await buildRiskRegisterHtml(ctx, property || undefined)
    await recordAudit(ctx, {
      entityType: 'risk_register',
      entityId: property || ctx.tenantId,
      action: 'export',
      summary: 'Exported Risk Register to PDF',
      metadata: { format: 'pdf', propertyId: property },
    })
    return riskPdfAttachmentResponse(
      await renderOnDemandPdfResponse({
        kind: 'template_pdf',
        tenantId: ctx.tenantId,
        html,
        paperSize: 'a4',
        orientation: 'landscape',
        marginMm: 10,
        headerHtml: null,
        footerHtml: 'Page {{page}} of {{pages}}',
        entityType: 'risk_register',
        entityId: property || ctx.tenantId,
        filename: 'risk-register.pdf',
      }),
      'risk-register.pdf',
    )
  })
}
