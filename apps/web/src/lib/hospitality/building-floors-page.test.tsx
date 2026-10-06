import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactNode } from 'react'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), entitlement: vi.fn(), list: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.auth }))
vi.mock('@/lib/module-entitlements/server', () => ({
  assertTenantModuleEntitled: mocks.entitlement,
  loadEnabledModuleKeys: async () => new Set(),
}))
vi.mock('@/lib/hospitality/properties', () => ({ listProperties: mocks.list }))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
  getGeneratedValueTranslations: async () => (value: string) => value,
}))
vi.mock('@/components/page-layout', () => ({ PageContainer: 'main' }))
vi.mock('@/components/search-input', () => ({ SearchInput: 'search-control' }))
vi.mock('@/components/pagination', () => ({ Pagination: 'page-control' }))
vi.mock('@/components/confirm-button', () => ({ ConfirmButton: 'confirm-control' }))
vi.mock('@beaconhs/ui', () => ({
  Button: 'button',
  EmptyState: 'empty-state',
  PageHeader: 'page-header',
  Input: 'input',
  Label: 'label',
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404')
  },
}))
vi.mock('../../app/(app)/hospitality/properties/actions', () => ({
  createFloorAction: vi.fn(),
  updateBuildingAction: vi.fn(),
  createBuildingAction: vi.fn(),
  archivePropertyAction: vi.fn(),
  createPropertyAction: vi.fn(),
}))
vi.mock('../../app/(app)/hospitality/properties/new/property-form', () => ({
  PropertyForm: 'property-form',
}))
import BuildingPage from '../../app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/page'
const id = '20000000-0000-4000-8000-000000000001'
const tenant = '10000000-0000-4000-8000-000000000001'
function nodes(value: ReactNode): { type: unknown; props: Record<string, any> }[] {
  return Children.toArray(value).flatMap((child) => {
    if (!isValidElement<Record<string, any>>(child)) return []
    return [
      { type: child.type, props: child.props },
      ...nodes(child.props.children),
      ...nodes(child.props.actions),
    ]
  })
}
function fixture({ visible = true, manage = true, total = 0 } = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const pages: { limit: number; offset: number }[] = []
  const dialect = new PgDialect()
  const tx = {
    select: (fields?: unknown) => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (sql: SQL) => {
          queries.push(dialect.sqlToQuery(sql))
          if (fields && typeof fields === 'object' && fields !== null && 'value' in fields)
            return Promise.resolve([{ value: total }])
          if (getTableName(table) === 'hospitality_properties') {
            const rows = visible
              ? [{ id, tenantId: tenant, name: 'Hotel', code: 'LON', timezone: 'UTC' }]
              : []
            return {
              limit: async () => rows,
              orderBy: async () =>
                rows.map(({ id: propertyId, name }) => ({ id: propertyId, name })),
            }
          }
          if (getTableName(table) === 'hospitality_buildings')
            return {
              limit: async () => (visible ? [{ id: buildingId, name: 'West', code: 'W' }] : []),
            }
          return {
            orderBy: () => ({
              limit: (limit: number) => ({
                offset: async (offset: number) => {
                  pages.push({ limit, offset })
                  return []
                },
              }),
            }),
          }
        },
      }),
    }),
  }
  const ctx = {
    tenantId: tenant,
    timezone: 'UTC',
    isSuperAdmin: false,
    scopes: [{ type: 'tenant' }],
    permissions: new Set(
      manage ? ['hospitality.read', 'hospitality.manage'] : ['hospitality.read'],
    ),
    db: vi.fn(async (run: (tx: unknown) => unknown) => run(tx)),
  }
  mocks.auth.mockResolvedValue(ctx)
  return { ctx, queries, pages }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.entitlement.mockResolvedValue(undefined)
})

const buildingId = '30000000-0000-4000-8000-000000000001'
const page = (search: Record<string, string> = {}, building = buildingId) =>
  BuildingPage({
    params: Promise.resolve({ propertyId: id, buildingId: building }),
    searchParams: Promise.resolve(search),
  })
describe('building floor browsing', () => {
  it('shares tenant/building/name/code filters between bounded list and count', async () => {
    const f = fixture({ total: 18 })
    const rendered = nodes(await page({ q: 'West', page: '2', perPage: '5' }))
    expect(f.queries[2]).toEqual(f.queries[3])
    expect(f.queries[2]?.params).toEqual([tenant, buildingId, '%West%', '%West%'])
    expect(f.queries[2]?.sql).toContain('"deleted_at" is null')
    expect(f.pages).toEqual([{ limit: 5, offset: 5 }])
    expect(rendered.find((n) => n.type === 'page-control')?.props).toMatchObject({
      total: 18,
      page: 2,
      perPage: 5,
    })
  })
  it('uses a search empty state without a creation prompt', async () => {
    fixture()
    const rendered = nodes(await page({ q: 'missing' }))
    expect(rendered.find((n) => n.type === 'empty-state')?.props).toMatchObject({
      title: 'm_0c726da8b78d42',
      description: undefined,
    })
  })
  it('validates UUID before data access', async () => {
    const f = fixture()
    await expect(page({}, 'invalid')).rejects.toThrow('404')
    expect(f.ctx.db).not.toHaveBeenCalled()
  })
  it('does not query floors below an unavailable property', async () => {
    const f = fixture({ visible: false })
    await expect(page()).rejects.toThrow('404')
    expect(f.queries).toHaveLength(1)
  })
  it('denies readers from another property before querying', async () => {
    const f = fixture()
    f.ctx.scopes = [
      { type: 'property', id: '20000000-0000-4000-8000-000000000099' },
    ] as typeof f.ctx.scopes
    await expect(page()).rejects.toThrow()
    expect(f.ctx.db).not.toHaveBeenCalled()
  })
  it('requires entitlement and read permission before querying', async () => {
    const f = fixture()
    mocks.entitlement.mockRejectedValueOnce(new Error('disabled'))
    await expect(page()).rejects.toThrow('disabled')
    f.ctx.permissions.clear()
    await expect(page()).rejects.toThrow()
    expect(f.ctx.db).not.toHaveBeenCalled()
  })
})
