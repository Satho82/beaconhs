import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenError, ImpersonationBlockedError } from '@beaconhs/tenant'
import { GET as assessmentPdf } from '@/app/(app)/hospitality/risk/assessments/[assessmentId]/pdf/route'
import { GET as registerPdf } from '@/app/(app)/hospitality/risk/register/pdf/route'

const mocks = vi.hoisted(() => ({
  exportContext: vi.fn(),
  report: vi.fn(),
  render: vi.fn(),
  audit: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireExportContext: mocks.exportContext }))
vi.mock('@/lib/audit', () => ({ recordAudit: mocks.audit }))
vi.mock('@/lib/pdf-route', () => ({ renderOnDemandPdfResponse: mocks.render }))
vi.mock('@/lib/risk-reporting', () => ({
  buildRiskAssessmentHtml: mocks.report,
  loadRiskReport: mocks.report,
  buildRiskRegisterHtml: mocks.report,
}))
beforeEach(() => vi.resetAllMocks())

describe('Risk PDF export authorization (no PDF server)', () => {
  for (const [name, request] of [
    [
      'assessment',
      () =>
        assessmentPdf(new Request('http://localhost/risk/pdf'), {
          params: Promise.resolve({ assessmentId: '10000000-0000-4000-8000-000000000001' }),
        }),
    ],
    ['register', () => registerPdf(new Request('http://localhost/risk/register/pdf'))],
  ] as const) {
    it.each([
      new ForbiddenError('admin.data.export'),
      new ForbiddenError('property'),
      new ImpersonationBlockedError('export'),
    ])(
      `${name}: denies without reading data, queuing a PDF or auditing a success (%s)`,
      async (error) => {
        mocks.exportContext.mockRejectedValue(error)
        const response = await request()
        expect(response.status).toBe(403)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('content-disposition')).toBeNull()
        expect(await response.json()).toEqual({ error: 'Forbidden' })
        expect(mocks.report).not.toHaveBeenCalled()
        expect(mocks.render).not.toHaveBeenCalled()
        expect(mocks.audit).not.toHaveBeenCalled()
      },
    )
  }
})
