import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ready: vi.fn().mockResolvedValue(false),
  audit: vi.fn(),
  report: vi.fn(),
  templates: vi.fn(),
  render: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireExportContext: async () => ({ tenantId: 'tenant-a' }) }))
vi.mock('@/lib/risk-schema-readiness', () => ({
  isRiskSchemaReady: mocks.ready,
  riskSchemaUnavailableResponse: () => Response.json({ error: 'Unavailable' }, { status: 503 }),
}))
vi.mock('@/lib/audit', () => ({ recordAudit: mocks.audit }))
vi.mock('@/lib/risk-reporting', () => ({
  buildRiskRegisterCsv: mocks.report,
  buildRiskRegisterHtml: mocks.report,
  buildRiskAssessmentHtml: mocks.report,
  loadRiskReport: mocks.report,
  escapeRiskCsv: (value: string) => value,
}))
vi.mock('@/lib/risk-assessments', () => ({ listRiskTemplates: mocks.templates }))
vi.mock('@/lib/pdf-route', () => ({ renderOnDemandPdfResponse: mocks.render }))

import { GET as registerCsv } from '@/app/(app)/hospitality/risk/export.csv/route'
import { GET as libraryCsv } from '@/app/(app)/hospitality/risk/library/export.csv/route'
import { GET as registerPdf } from '@/app/(app)/hospitality/risk/register/pdf/route'
import { GET as assessmentPdf } from '@/app/(app)/hospitality/risk/assessments/[assessmentId]/pdf/route'

describe('Risk exports on an unmigrated 0058 schema', () => {
  it('returns 503 before reading Risk data, rendering or recording a successful export', async () => {
    const request = new Request('http://localhost/hospitality/risk/export.csv')
    const responses = await Promise.all([
      registerCsv(request),
      libraryCsv(request),
      registerPdf(request),
      assessmentPdf(request, {
        params: Promise.resolve({ assessmentId: '10000000-0000-4000-8000-000000000001' }),
      }),
    ])
    expect(responses.map((response) => response.status)).toEqual([503, 503, 503, 503])
    expect(mocks.ready).toHaveBeenCalledTimes(4)
    expect(mocks.report).not.toHaveBeenCalled()
    expect(mocks.templates).not.toHaveBeenCalled()
    expect(mocks.render).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
