import { requireExportContext } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { isUuid } from '@/lib/list-params'
import { renderOnDemandPdfResponse } from '@/lib/pdf-route'
import { buildRiskRegisterCsv, escapeRiskReport, riskReportBranding } from '@/lib/risk-reporting'
import { isRouterPrefetch } from '@/lib/router-prefetch'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (isRouterPrefetch(request)) return new Response(null, { status: 204 })
  const ctx = await requireExportContext()
  const property = new URL(request.url).searchParams.get('property')
  if (property && !isUuid(property)) return Response.json({ error: 'Not found' }, { status: 404 })
  const [contents, branding] = await Promise.all([
    buildRiskRegisterCsv(ctx, property || undefined),
    riskReportBranding(ctx),
  ])
  const logo = (url: string | null, name: string) =>
    url
      ? `<img src="${escapeRiskReport(url)}" alt="${escapeRiskReport(name)}" style="max-height:44px;max-width:180px;object-fit:contain">`
      : `<strong style="font-size:20px">${escapeRiskReport(name)}</strong>`
  const html = `<div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#0f172a">
    <header style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:10px">
      ${logo(branding.platformLogoUrl, branding.platformName)}
      ${logo(branding.customerLogoUrl, branding.customerName)}
    </header>
    <h1 style="font-size:20px">Risk Register</h1>
    <p style="font-size:11px;color:#475569">${escapeRiskReport(branding.customerName)}</p>
    <pre style="font-size:8px;white-space:pre-wrap;border:1px solid #cbd5e1;padding:8px">${escapeRiskReport(contents)}</pre>
    <footer style="font-size:9px;color:#64748b">${escapeRiskReport(branding.platformSupport)} · ${escapeRiskReport(branding.customerEmail)}</footer>
  </div>`
  await recordAudit(ctx, {
    entityType: 'risk_register',
    entityId: property || ctx.tenantId,
    action: 'export',
    summary: 'Exported Risk Register to PDF',
    metadata: { format: 'pdf', propertyId: property },
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
    entityType: 'risk_register',
    entityId: property || ctx.tenantId,
    filename: 'risk-register.pdf',
  })
}
