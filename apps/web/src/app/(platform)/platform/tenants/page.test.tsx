import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ guard: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePlatformOperator: mocks.guard }))
vi.mock('@beaconhs/db', () => ({ db: {}, withSuperAdmin: mocks.load }))
vi.mock('@/lib/actions', () => ({ setActiveTenant: vi.fn() }))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedValueTranslations: async () => (value: string) => value,
  getGeneratedTranslations: async () => (key: string) => key,
}))
vi.mock('@/i18n/generated', () => ({
  GeneratedValue: ({ value }: { value: React.ReactNode }) => value,
  GeneratedText: () => null,
}))
vi.mock('@/components/page-layout', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/filter-bar', () => ({ FilterChips: () => null }))
vi.mock('@/components/pagination', () => ({ Pagination: () => null }))
vi.mock('@/components/search-input', () => ({ SearchInput: () => null }))
vi.mock('@/components/sortable-th', () => ({ SortableTh: () => <th /> }))
vi.mock('@/components/table-toolbar', () => ({ TableToolbar: () => null }))
vi.mock('@beaconhs/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DetailHeader: () => null,
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}))
import Page from './page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guard.mockResolvedValue({ userId: 'operator' })
})

it('opens every lifecycle state while keeping tenant switching restricted to active tenants', async () => {
  mocks.load.mockResolvedValue({
    rows: ['active', 'suspended', 'archived'].map((status, index) => ({
      tenant: {
        id: `tenant-${index}`,
        name: `Hotel ${status}`,
        status,
        slug: status,
        region: 'UK',
      },
      propertyCount: 3,
      effectiveCount: 2,
      memberCount: 4,
      peopleCount: 0,
      incidentCount: 0,
    })),
    total: 3,
    statusCounts: { active: 1, suspended: 1, archived: 1 },
  })
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
  for (const index of [0, 1, 2]) expect(html).toContain(`href="/platform/tenants/tenant-${index}"`)
  expect(html).toContain('Hotel archived')
  expect(html).toContain('name="tenantId" value="tenant-0"')
  expect(html).not.toContain('name="tenantId" value="tenant-1"')
  expect(html).not.toContain('name="tenantId" value="tenant-2"')
})
it('authorizes before cross-tenant portfolio reads', async () => {
  mocks.guard.mockRejectedValue(new Error('Forbidden'))
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('Forbidden')
  expect(mocks.load).not.toHaveBeenCalled()
})
