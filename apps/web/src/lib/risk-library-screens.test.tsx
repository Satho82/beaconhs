import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RISK_CATALOGUE_TEMPLATES } from '@beaconhs/db'
import RiskLibraryPage from '@/app/(app)/hospitality/risk/page'
import { AvailableTemplates } from '@/app/(app)/hospitality/risk/available-templates'
import { RiskSchemaNotice } from '@/app/(app)/hospitality/risk/risk-schema-notice'

const mocks = vi.hoisted(() => ({
  templates: vi.fn(),
  assessments: vi.fn(),
  context: vi.fn(),
  property: vi.fn(),
  can: vi.fn(),
  schemaReady: vi.fn(),
}))
vi.mock('@/lib/risk-schema-readiness', () => ({ isRiskSchemaReady: mocks.schemaReady }))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.context }))
vi.mock('@/lib/hospitality/property-context', () => ({
  resolveHospitalityPropertyContext: mocks.property,
}))
vi.mock('@/lib/risk-assessments', () => ({
  listRiskTemplates: mocks.templates,
  listRiskAssessments: mocks.assessments,
}))
vi.mock('@beaconhs/tenant', () => ({ can: mocks.can }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedValueTranslations: async () => (value: string) => value,
}))
vi.mock('@/i18n/generated', () => ({
  useGeneratedValueTranslations: () => (value: string) => value,
  useGeneratedTranslations: () => (_key: string, values: { value0: string }) =>
    `Remove ${values.value0}`,
}))
vi.mock('@/components/page-layout', () => ({
  PageContainer: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/pagination', () => ({
  Pagination: ({ total, page }: { total: number; page: number }) => (
    <p>
      Page {page}, total {total}
    </p>
  ),
}))
vi.mock('@beaconhs/ui', () => ({
  Drawer: () => null,
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Button: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Select: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

const propertyA = '20000000-0000-4000-8000-000000000001'
const propertyB = '20000000-0000-4000-8000-000000000002'
const tenantA = '10000000-0000-4000-8000-000000000001'
const tenantB = '10000000-0000-4000-8000-000000000002'
const assessment = {
  assessment: {
    id: 'assessment-a',
    propertyId: propertyA,
    reference: 'RA-PROPERTY',
    title: 'Saved property assessment',
    assessmentCategory: 'general',
    matrixSnapshot: null,
    contentRevision: 1,
    adoptedTemplateSnapshot: {
      category: 'general',
      version: '1.0',
      description: 'Legacy snapshot',
    },
    adoptedTemplateVersion: '1.0',
    status: 'draft',
    nextReviewDate: null,
    reminderLeadDays: 30,
  },
  property: { name: 'Synthetic A' },
}

function context(tenantId: string) {
  return {
    tenantId,
    db: async (fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({ groupBy: async () => [], limit: async () => [] }),
            innerJoin: () => ({ where: async () => [] }),
          }),
        }),
      }),
  }
}
async function render(search: Record<string, string>) {
  const element = await RiskLibraryPage({ searchParams: Promise.resolve(search) })
  const resolved =
    element.type === AvailableTemplates
      ? await AvailableTemplates(
          (element as ReactElement<Parameters<typeof AvailableTemplates>[0]>).props,
        )
      : element.type === RiskSchemaNotice
        ? await RiskSchemaNotice()
        : element
  return renderToStaticMarkup(resolved)
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue(context(tenantA))
  mocks.property.mockResolvedValue({
    activePropertyId: propertyA,
    properties: [{ id: propertyA, name: 'Synthetic A' }],
  })
  mocks.can.mockReturnValue(true)
  mocks.schemaReady.mockResolvedValue(true)
  mocks.templates.mockResolvedValue(
    RISK_CATALOGUE_TEMPLATES.map((row) => ({ ...row, deletedAt: null })),
  )
  mocks.assessments.mockResolvedValue([assessment])
})

describe('actual Risk page screen separation', () => {
  it('shows a safe notice without querying Risk data on the 0058 schema', async () => {
    mocks.schemaReady.mockResolvedValue(false)
    const html = await render({ view: 'assessments' })
    expect(html).toContain('temporarily unavailable')
    expect(mocks.assessments).not.toHaveBeenCalled()
    expect(mocks.templates).not.toHaveBeenCalled()
  })
  it('renders only template records and existing detail/adoption anchors', async () => {
    const html = await render({ view: 'templates', q: 'RA-001', property: propertyA })
    expect(mocks.assessments).not.toHaveBeenCalled()
    expect(html).toContain('General Workplace Health &amp; Safety')
    expect(html).not.toContain('Saved property assessment')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain(`view=assessments&amp;property=${propertyA}`)
    expect(html).toContain('#template-adoption')
    expect(html).toContain('#template-amend')
    expect(html).toContain('name="view" value="templates"')
  })
  it('renders property records with existing edit/PDF links and no template cards', async () => {
    const html = await render({ view: 'assessments' })
    expect(mocks.templates).not.toHaveBeenCalled()
    expect(mocks.assessments).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantA }),
      propertyA,
    )
    expect(html).toContain('Saved property assessment')
    expect(html).not.toContain('General Workplace Health')
    expect(html).toContain('/hospitality/risk/assessments/assessment-a#assessment-editor')
    expect(html).toContain('/hospitality/risk/assessments/assessment-a/pdf')
    expect(html).toContain(`/hospitality/risk/register/pdf?property=${propertyA}`)
    expect(html).toContain('download="risk-register.csv"')
    expect(html).toContain('download="risk-register.pdf"')
    expect(html).toContain('Create assessment from a template')
    expect(html).toContain('Create from scratch')
  })
  it.each([
    [tenantA, propertyA, propertyB],
    [tenantB, propertyB, propertyA],
  ])(
    'rejects a foreign/property-restricted URL for %s before assessment queries',
    async (tenant, allowed, denied) => {
      mocks.context.mockResolvedValue(context(tenant))
      mocks.property.mockResolvedValue({ activePropertyId: allowed, properties: [{ id: allowed }] })
      await expect(render({ view: 'assessments', property: denied })).rejects.toThrow('NOT_FOUND')
      expect(mocks.assessments).not.toHaveBeenCalled()
    },
  )
  it('does not broaden missing selection to an authorised portfolio', async () => {
    mocks.property.mockResolvedValue({
      activePropertyId: null,
      properties: [{ id: propertyA }, { id: propertyB }],
    })
    const html = await render({ view: 'assessments' })
    expect(mocks.assessments).not.toHaveBeenCalled()
    expect(html).toContain('Choose a property to view its assessments.')
    expect(html).not.toContain('Export Risk Register PDF')
  })
  it('hides risk register exports when the caller lacks the generic export permission', async () => {
    mocks.can.mockImplementation((_ctx, permission) => permission !== 'admin.data.export')
    const html = await render({ view: 'assessments' })
    expect(html).not.toContain('Export Risk Register CSV')
    expect(html).not.toContain('Export Risk Register PDF')
    expect(html).toContain('/hospitality/risk/assessments/assessment-a/pdf')
  })
  it('uses search, status and pagination before rendering assessment rows', async () => {
    mocks.assessments.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        ...assessment,
        assessment: { ...assessment.assessment, id: `id-${i}`, title: `Saved row ${i}` },
      })),
    )
    const html = await render({ view: 'assessments', page: '2' })
    expect(html).toContain('Saved row 10')
    expect(html).not.toContain('Saved row 0<')
    expect(html).toContain('Page 2, total 12')
    expect(await render({ view: 'assessments', q: 'missing' })).toContain(
      'No risk assessments found',
    )
    expect(await render({ view: 'assessments', status: 'active' })).toContain(
      'No risk assessments found',
    )
  })
  it('hides mutation links from a reader while preserving preview/open/PDF', async () => {
    mocks.can.mockReturnValue(false)
    const templates = await render({ view: 'templates' })
    expect(templates).toContain('Preview')
    expect(templates).not.toContain('#template-adoption')
    const assessments = await render({ view: 'assessments' })
    expect(assessments).not.toContain('#assessment-editor')
    expect(assessments).toContain('/assessment-a/pdf')
  })
})
