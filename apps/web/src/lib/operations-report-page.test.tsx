import { Children, isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ definitions: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  requireRequestContext: async () => ({
    tenantId: 'tenant',
    isSuperAdmin: false,
    permissions: new Set(['reports.read']),
  }),
}))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
}))
vi.mock('@/i18n/generated', () => ({ GeneratedText: 'translated-text' }))
vi.mock('@/components/page-layout', () => ({ ListPageLayout: 'main' }))
vi.mock('@/components/search-input', () => ({ SearchInput: 'search' }))
vi.mock('@/components/filter-bar', () => ({ FilterChips: 'filters' }))
vi.mock('@/components/pagination', () => ({ Pagination: 'pagination' }))
vi.mock('@/app/(app)/reports/_definitions', () => ({ loadVisibleDefinitions: mocks.definitions }))
vi.mock('@/app/(app)/reports/_nav', () => ({ ReportsSubNav: 'nav' }))
vi.mock('@/app/(app)/reports/_delete-report-button.client', () => ({
  DeleteReportButton: 'delete',
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@beaconhs/ui', () => ({
  Badge: 'badge',
  Button: 'button',
  PageHeader: 'header',
  EmptyState: 'empty-state',
  Table: 'table',
  TableBody: 'tbody',
  TableCell: 'td',
  TableHead: 'th',
  TableHeader: 'thead',
  TableRow: 'tr',
}))
import ReportsPage from '@/app/(app)/reports/page'
function nodes(value: ReactNode): { type: unknown; props: Record<string, any> }[] {
  return Children.toArray(value).flatMap((child) =>
    isValidElement<Record<string, any>>(child)
      ? [
          { type: child.type, props: child.props },
          ...nodes(child.props.children),
          ...nodes(child.props.header),
        ]
      : [],
  )
}
beforeEach(() =>
  mocks.definitions.mockResolvedValue([
    {
      id: 'report-1',
      name: 'Room issues',
      category: 'operations',
      query: { entity: 'maintenance' },
      updatedAt: new Date('2026-10-01'),
    },
  ]),
)
const page = async (search: Record<string, string>) =>
  nodes(await ReportsPage({ searchParams: Promise.resolve(search) }))
describe('Operations report browsing', () => {
  it.each(['Infinity', 'NaN', '-1'])(
    'recovers invalid page %s to the first real record',
    async (value) => {
      const rendered = await page({ page: value })
      expect(rendered.find((n) => n.type === 'pagination')?.props).toMatchObject({
        page: 1,
        total: 1,
      })
      expect(rendered.some((n) => n.props.href === '/reports/definitions/report-1')).toBe(true)
      expect(rendered.some((n) => n.type === 'delete')).toBe(false)
    },
  )
  it('distinguishes filtered empty results while retaining navigation', async () => {
    const rendered = await page({ q: 'missing' })
    expect(
      rendered.some((n) => n.type === 'empty-state' && n.props.title === 'm_0c726da8b78d42'),
    ).toBe(true)
    expect(rendered.find((n) => n.type === 'pagination')?.props.total).toBe(0)
  })
})
