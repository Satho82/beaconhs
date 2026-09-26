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
  createBuildingAction: vi.fn(),
  archivePropertyAction: vi.fn(),
  createPropertyAction: vi.fn(),
}))
vi.mock('../../app/(app)/hospitality/properties/new/property-form', () => ({
  PropertyForm: 'property-form',
}))
import PropertyDetail from '../../app/(app)/hospitality/properties/[propertyId]/page'
import PropertyList from '../../app/(app)/hospitality/properties/page'
import NewProperty from '../../app/(app)/hospitality/properties/new/page'

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
const detail = (search: Record<string, string> = {}, propertyId = id) =>
  PropertyDetail({ params: Promise.resolve({ propertyId }), searchParams: Promise.resolve(search) })

describe('property page workflow', () => {
  it('links Add property and each property to the correct routes', async () => {
    fixture()
    mocks.list.mockResolvedValue({
      properties: [{ id, name: 'Hotel', code: 'LON', timezone: 'UTC' }],
      total: 1,
      params: { page: 1, perPage: 25 },
    })
    const rendered = nodes(await PropertyList({ searchParams: Promise.resolve({}) }))
    expect(rendered.filter((n) => n.type === 'a').map((n) => n.props.href)).toEqual([
      '/hospitality/properties/new',
      '/hospitality/properties/' + id,
    ])
    const create = nodes(await NewProperty())
    expect(create.find((n) => n.type === 'property-form')?.props.timezone).toBe('UTC')
  })
  it('hides Add property and archive controls from readers and denies the create page', async () => {
    fixture({ manage: false })
    mocks.list.mockResolvedValue({ properties: [], total: 0, params: { page: 1, perPage: 25 } })
    expect(
      nodes(await PropertyList({ searchParams: Promise.resolve({}) })).some(
        (n) => n.props.href === '/hospitality/properties/new',
      ),
    ).toBe(false)
    expect(nodes(await detail()).some((n) => n.type === 'confirm-control')).toBe(false)
    await expect(NewProperty()).rejects.toThrow()
  })
  it('requires confirmation on the manager archive form', async () => {
    fixture()
    const rendered = nodes(await detail())
    expect(rendered.find((n) => n.type === 'confirm-control')?.props).toMatchObject({
      name: 'confirmation',
      value: 'archive',
      variant: 'destructive',
    })
    expect(rendered.find((n) => n.type === 'input' && n.props.name === 'id')?.props.value).toBe(id)
  })
  it.each(['new', 'invalid', ''])(
    'returns 404 for invalid ID %s without accessing the database',
    async (bad) => {
      const f = fixture()
      await expect(detail({}, bad)).rejects.toThrow('404')
      expect(f.ctx.db).not.toHaveBeenCalled()
    },
  )
  it('scopes property lookup to the current tenant and active records; hides missing properties', async () => {
    const f = fixture({ visible: false })
    await expect(detail()).rejects.toThrow('404')
    expect(f.queries).toHaveLength(1)
    expect(f.queries[0]?.params).toEqual([tenant, id])
    expect(f.queries[0]?.sql).toContain('"deleted_at" is null')
  })
  it('denies detail access without read permission or entitlement before querying', async () => {
    const f = fixture()
    f.ctx.permissions.clear()
    await expect(detail()).rejects.toThrow()
    expect(f.ctx.db).not.toHaveBeenCalled()
    f.ctx.permissions.add('hospitality.read')
    mocks.entitlement.mockRejectedValueOnce(new Error('disabled'))
    await expect(detail()).rejects.toThrow('disabled')
    expect(f.ctx.db).not.toHaveBeenCalled()
  })
  it('uses identical tenant/property/name/code filters for building count and bounded page', async () => {
    const f = fixture({ total: 14 })
    const rendered = nodes(await detail({ q: 'Wing', page: '2', perPage: '5' }))
    expect(f.queries[1]).toEqual(f.queries[2])
    expect(f.queries[1]?.params).toEqual([tenant, id, '%Wing%', '%Wing%'])
    expect(f.queries[1]?.sql).toContain('"name" ilike')
    expect(f.queries[1]?.sql).toContain('"code" ilike')
    expect(f.pages).toEqual([{ limit: 5, offset: 5 }])
    expect(rendered.find((n) => n.type === 'page-control')?.props).toMatchObject({
      total: 14,
      page: 2,
      perPage: 5,
    })
  })
  it('bounds invalid building pages and removes the search predicate when cleared', async () => {
    const f = fixture()
    await detail({ q: '', page: '-1', perPage: '1000000' })
    expect(f.pages).toEqual([{ limit: 100, offset: 0 }])
    expect(f.queries[1]?.params).toEqual([tenant, id])
    expect(f.queries[1]?.sql).not.toContain('ilike')
  })
  it('uses a search empty state instead of prompting creation for zero matches', async () => {
    fixture()
    const rendered = nodes(await detail({ q: 'missing' }))
    expect(rendered.find((n) => n.type === 'empty-state')?.props).toMatchObject({
      title: 'm_0c726da8b78d42',
      description: undefined,
    })
    mocks.list.mockResolvedValue({
      properties: [],
      total: 0,
      params: { q: 'missing', page: 1, perPage: 25 },
    })
    const list = nodes(await PropertyList({ searchParams: Promise.resolve({ q: 'missing' }) }))
    expect(list.find((n) => n.type === 'empty-state')?.props).toMatchObject({
      title: 'm_0c726da8b78d42',
      description: undefined,
    })
  })
})
