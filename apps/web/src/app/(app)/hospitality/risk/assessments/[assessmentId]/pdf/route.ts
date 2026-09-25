import { requireRequestContext } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { isUuid } from '@/lib/list-params'
import { renderOnDemandPdfResponse } from '@/lib/pdf-route'
import { buildRiskAssessmentHtml, loadRiskReport } from '@/lib/risk-reporting'
import { isRouterPrefetch } from '@/lib/router-prefetch'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  const { assessmentId } = await params
  if (!isUuid(assessmentId)) return Response.json({ error: 'Not found' }, { status: 404 })
  const signoffId = new URL(request.url).searchParams.get('signoffId') || undefined
  if (signoffId && !isUuid(signoffId)) return Response.json({ error: 'Not found' }, { status: 404 })
  const ctx = await requireRequestContext()
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
  return renderOnDemandPdfResponse({
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
  })
}
