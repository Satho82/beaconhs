import { Children, isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
  getGeneratedValueTranslations: async () => (value: string) => value,
}))
vi.mock('@/i18n/generated', () => ({
  GeneratedText: 'translated-text',
  GeneratedValue: 'translated-value',
}))
vi.mock('@/components/page-layout', () => ({ ListPageLayout: 'main' }))
vi.mock('@/components/search-input', () => ({ SearchInput: 'search' }))
vi.mock('@/components/filter-bar', () => ({ FilterChips: 'filters' }))
vi.mock('@/components/pagination', () => ({ Pagination: 'pagination' }))
vi.mock('@/components/download-link', () => ({ DownloadLink: 'download' }))
vi.mock('@/lib/module-admin/guard', () => ({ canManageModule: () => true }))
vi.mock('@/app/(app)/people/_components/people-sub-nav', () => ({ PeopleSubNav: 'nav' }))
vi.mock('@/app/(app)/people/_records-table', () => ({ PeopleRecordsTable: 'records' }))
vi.mock('@/app/(app)/people/_actions/bulk', () => ({
  listPersonGroupsForBulk: async () => [],
  listPersonDepartmentsForBulk: async () => [],
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('@beaconhs/ui', () => ({ Button: 'button', EmptyState: 'empty', PageHeader: 'header' }))
vi.mock('@/lib/auth', () => ({
  requireRequestContext: async () => ({
    permissions: new Set(),
    db: async (run: (tx: unknown) => unknown) =>
      run({
        select: (fields: Record<string, unknown>) => {
          const builder = {
            from: () => builder,
            leftJoin: () => builder,
            where: () =>
              'person' in fields || 'status' in fields ? builder : Promise.resolve([{ c: 5 }]),
            orderBy: () => builder,
            limit: () => builder,
            offset: async () => [],
            groupBy: async () => [],
          }
          return builder
        },
      }),
  }),
}))
import PeoplePage from '@/app/(app)/people/page'
function nodes(value: ReactNode): { type: unknown; props: Record<string, any> }[] {
  return Children.toArray(value).flatMap((child) =>
    isValidElement<Record<string, any>>(child)
      ? [
          { type: child.type, props: child.props },
          ...nodes(child.props.children),
          ...nodes(child.props.value),
        ]
      : [],
  )
}
describe('People filtered empty state', () => {
  it.each([
    { q: 'missing' },
    { status: 'inactive' },
    { department: 'department-1' },
    { page: '2' },
  ])('offers filter recovery and retains pagination for %j', async (search) => {
    const rendered = nodes(await PeoplePage({ searchParams: Promise.resolve(search) }))
    const empty = rendered.find((n) => n.type === 'empty')
    expect(empty?.props.description).toBe('Adjust the search or filters to find matching records.')
    expect(empty?.props.action).toBeNull()
    expect(rendered.find((n) => n.type === 'pagination')?.props.total).toBe(5)
  })
})
