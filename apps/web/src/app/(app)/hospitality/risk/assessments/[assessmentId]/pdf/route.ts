import { requireExportContext } from '@/lib/auth'
import { riskExportResponse } from '@/lib/risk-export-response'
import { recordAudit } from '@/lib/audit'
import { isUuid } from '@/lib/list-params'
import { renderOnDemandPdfResponse } from '@/lib/pdf-route'
import { riskPdfAttachmentResponse } from '@/lib/risk-pdf-response'
import { buildRiskAssessmentHtml, loadRiskReport } from '@/lib/risk-reporting'
import { isRouterPrefetch } from '@/lib/router-prefetch'
import { isRiskSchemaReady, riskSchemaUnavailableResponse } from '@/lib/risk-schema-readiness'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  return riskExportResponse(async () => {
    const { assessmentId } = await params
    if (!isUuid(assessmentId)) return Response.json({ error: 'Not found' }, { status: 404 })
    const signoffId = new URL(request.url).searchParams.get('signoffId') || undefined
    if (signoffId && !isUuid(signoffId))
      return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await requireExportContext()
    if (!(await isRiskSchemaReady(ctx))) return riskSchemaUnavailableResponse()
    const [html, report] = await Promise.all([
      buildRiskAssessmentHtml(ctx, assessmentId, signoffId),
      loadRiskReport(ctx, assessmentId),
    ])
    if (!html || !report) return Response.json({ error: 'Not found' }, { status: 404 })
    await recordAudit(ctx, {
      entityType: 'risk_assessment',
      entityId: assessmentId,
      action: 'export',
      summary: `Exported risk assessment ${report.assessment.reference} to PDF`,
      metadata: {
        format: 'pdf',
        templateVersion: report.assessment.adoptedTemplateVersion,
        signoffId: signoffId || null,
      },
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
        entityType: 'risk_assessment',
        entityId: assessmentId,
        filename: `risk-assessment-${report.assessment.reference}.pdf`,
      }),
      `risk-assessment-${report.assessment.reference}.pdf`,
    )
  })
}
