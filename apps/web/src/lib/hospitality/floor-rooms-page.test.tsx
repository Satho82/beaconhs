import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactNode } from 'react'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), entitlement: vi.fn(), modules: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.auth }))
vi.mock('@/lib/module-entitlements/server', () => ({
  assertTenantModuleEntitled: mocks.entitlement,
  loadEnabledModuleKeys: mocks.modules,
}))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
  getGeneratedValueTranslations: async () => (value: string) => value,
}))
vi.mock('@/components/search-input', () => ({ SearchInput: 'search-control' }))
vi.mock('@/components/filter-bar', () => ({ FilterChips: 'filter-control' }))
vi.mock('@/components/pagination', () => ({ Pagination: 'page-control' }))
vi.mock('@beaconhs/ui', () => ({
  Button: 'button',
  EmptyState: 'empty-state',
  Input: 'input',
  Label: 'label',
  PageHeader: 'page-header',
}))
vi.mock('next/link', () => ({ default: 'a' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404')
  },
}))
vi.mock('@/app/(app)/hospitality/properties/actions', () => ({
  createRoomAction: vi.fn(),
  updateFloorAction: vi.fn(),
  updateRoomAction: vi.fn(),
  reportMaintenanceIssueAction: vi.fn(),
  provisionRoomQrAction: vi.fn(),
  rotateRoomQrAction: vi.fn(),
}))
import FloorPage from '@/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/floors/[floorId]/page'
import RoomPage from '@/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/floors/[floorId]/rooms/[roomId]/page'
import RoomQrPage from '@/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/floors/[floorId]/rooms/[roomId]/qr/page'

const tenant = '10000000-0000-4000-8000-000000000001'
const propertyId = '20000000-0000-4000-8000-000000000001'
const buildingId = '30000000-0000-4000-8000-000000000001'
const floorId = '40000000-0000-4000-8000-000000000001'
const roomId = '50000000-0000-4000-8000-000000000001'
const basePath = `/hospitality/properties/${propertyId}/buildings/${buildingId}/floors/${floorId}`
function nodes(value: ReactNode): { type: unknown; props: Record<string, any> }[] {
  return Children.toArray(value).flatMap((child) => {
    if (!isValidElement<Record<string, any>>(child)) return []
    return [{ type: child.type, props: child.props }, ...nodes(child.props.children)]
  })
}
function fixture({ visible = true, manage = true, total = 31, room = true } = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const joins: { sql: string; params: unknown[] }[] = []
  const order: string[][] = []
  const pages: { limit: number; offset: number }[] = []
  const dialect = new PgDialect()
  const tx = {
    select: (fields?: unknown) => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const builder = {
          innerJoin: (_table: unknown, condition: SQL) => {
            joins.push(dialect.sqlToQuery(condition))
            return builder
          },
          where: (condition: SQL) => {
            queries.push(dialect.sqlToQuery(condition))
            if (getTableName(table) === 'hospitality_floors')
              return {
                limit: async () =>
                  visible ? [{ floor: { id: floorId, name: 'First floor', code: 'F1' } }] : [],
              }
            if (fields) return Promise.resolve([{ value: total }])
            return {
              orderBy: (...columns: SQL[]) => {
                order.push(columns.map((column) => dialect.sqlToQuery(column).sql))
                return {
                  limit: (limit: number) => ({
                    offset: async (offset: number) => {
                      pages.push({ limit, offset })
                      return room
                        ? [
                            {
                              id: roomId,
                              code: '101',
                              name: 'Garden suite',
                              roomType: 'apartment',
                              status: 'available',
                            },
                          ]
                        : []
                    },
                  }),
                }
              },
            }
          },
        }
        return builder
      },
    }),
  }
  const ctx = {
    tenantId: tenant,
    isSuperAdmin: false,
    scopes: [{ type: 'tenant' as const }],
    permissions: new Set(
      manage ? ['hospitality.read', 'hospitality.manage'] : ['hospitality.read'],
    ),
    db: vi.fn(async (run: (tx: unknown) => unknown) => run(tx)),
  }
  mocks.auth.mockResolvedValue(ctx)
  return { ctx, queries, joins, order, pages }
}
const page = (search: Record<string, string | string[] | undefined> = {}, floor = floorId) =>
  FloorPage({
    params: Promise.resolve({ propertyId, buildingId, floorId: floor }),
    searchParams: Promise.resolve(search),
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.entitlement.mockResolvedValue(undefined)
  mocks.modules.mockResolvedValue(new Set(['hospitality.maintenance']))
})

describe('floor room and apartment browsing', () => {
  it('uses identical tenant/floor/search/status conditions for count and bounded rows', async () => {
    const f = fixture()
    const rendered = nodes(
      await page({ q: 'apartment', status: 'available', page: '2', perPage: '10' }),
    )
    expect(f.queries).toHaveLength(3)
    expect(f.queries[1]).toEqual(f.queries[2])
    expect(f.queries[1]?.params).toEqual([
      tenant,
      floorId,
      'available',
      '%apartment%',
      '%apartment%',
      '%apartment%',
    ])
    for (const column of ['code', 'name', 'room_type'])
      expect(f.queries[1]?.sql).toContain(`"${column}" ilike`)
    expect(f.queries[1]?.sql).toContain('"deleted_at" is null')
    expect(f.pages).toEqual([{ limit: 10, offset: 10 }])
    expect(f.order).toEqual([['"hospitality_rooms"."code" asc', '"hospitality_rooms"."id" asc']])
    expect(rendered.find((n) => n.type === 'page-control')?.props).toMatchObject({
      total: 31,
      page: 2,
      perPage: 10,
      basePath,
      currentParams: { q: 'apartment', status: 'available' },
    })
    expect(rendered.find((n) => n.type === 'filter-control')?.props).toMatchObject({
      paramKey: 'status',
      options: expect.arrayContaining([{ value: 'available', label: 'Available' }]),
    })
    expect(rendered.find((n) => n.type === 'a')?.props.href).toBe(`${basePath}/rooms/${roomId}`)
    expect(rendered.some((n) => n.type === 'search-control')).toBe(true)
  })
  it('checks the complete active hierarchy with tenant-bound joins', async () => {
    const f = fixture({ visible: false })
    await expect(page()).rejects.toThrow('404')
    expect(f.queries).toHaveLength(1)
    expect(f.pages).toEqual([])
    expect(f.queries[0]?.params).toEqual([tenant, floorId, buildingId, propertyId])
    for (const table of ['hospitality_properties', 'hospitality_buildings', 'hospitality_floors']) {
      expect(f.queries[0]?.sql).toContain(`"${table}"."deleted_at" is null`)
    }
    expect(f.joins).toHaveLength(2)
    expect(f.joins[0]?.sql).toContain(
      '"hospitality_buildings"."tenant_id" = "hospitality_floors"."tenant_id"',
    )
    expect(f.joins[1]?.sql).toContain(
      '"hospitality_properties"."tenant_id" = "hospitality_buildings"."tenant_id"',
    )
    expect(f.joins[1]?.sql).toContain(
      '"hospitality_properties"."id" = "hospitality_buildings"."property_id"',
    )
  })
  it.each(['all', 'invalid', ''])(
    'ignores non-enum status %s and bounds pagination',
    async (status) => {
      const f = fixture()
      const rendered = nodes(await page({ status, q: '', perPage: '1000000', page: '-1' }))
      expect(f.pages).toEqual([{ limit: 100, offset: 0 }])
      expect(f.queries[1]?.params).toEqual([tenant, floorId])
      expect(
        rendered.find((n) => n.type === 'filter-control')?.props.currentParams.status,
      ).toBeUndefined()
    },
  )
  it('normalizes repeated status values consistently for query and filter', async () => {
    const f = fixture()
    const rendered = nodes(await page({ status: ['occupied', 'blocked'] }))
    expect(f.queries[1]?.params).toEqual([tenant, floorId, 'occupied'])
    expect(rendered.find((n) => n.type === 'filter-control')?.props.currentParams.status).toBe(
      'occupied',
    )
  })
  it.each([{ q: 'missing' }, { status: 'blocked' }, { page: '999' }])(
    'shows no results for filters or an unavailable page',
    async (search) => {
      fixture({ room: false })
      const rendered = nodes(await page(search))
      expect(rendered.find((n) => n.type === 'empty-state')?.props).toMatchObject({
        title: 'm_0c726da8b78d42',
        description: undefined,
      })
      expect(rendered.some((n) => n.type === 'page-control')).toBe(true)
    },
  )
  it('keeps the original empty-floor guidance when no filters are active', async () => {
    fixture({ room: false, total: 0 })
    expect(nodes(await page()).find((n) => n.type === 'empty-state')?.props.title).toBe(
      'm_1e6c06be7b838f',
    )
  })
  it('allows readers to browse without displaying mutation forms', async () => {
    fixture({ manage: false })
    const rendered = nodes(await page())
    expect(rendered.some((n) => n.type === 'form')).toBe(false)
    expect(rendered.some((n) => n.type === 'a')).toBe(true)
  })
  it('rejects invalid IDs, missing permission, and disabled entitlement before querying', async () => {
    const f = fixture()
    await expect(page({}, 'invalid')).rejects.toThrow('404')
    f.ctx.permissions.clear()
    await expect(page()).rejects.toThrow()
    f.ctx.permissions.add('hospitality.read')
    mocks.entitlement.mockRejectedValueOnce(new Error('disabled'))
    await expect(page()).rejects.toThrow('disabled')
    expect(f.ctx.db).not.toHaveBeenCalled()
  })
})

function roomFixture(visible = true) {
  const f = fixture()
  const dialect = new PgDialect()
  const queries: { sql: string; params: unknown[] }[] = []
  const joins: { sql: string; params: unknown[] }[] = []
  const tx = {
    select: () => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const builder = {
          innerJoin: (_table: unknown, condition: SQL) => {
            joins.push(dialect.sqlToQuery(condition))
            return builder
          },
          where: (condition: SQL) => {
            queries.push(dialect.sqlToQuery(condition))
            if (getTableName(table) === 'maintenance_issues')
              return { orderBy: () => ({ limit: async () => [] }) }
            if (getTableName(table) === 'qr_targets') return { limit: async () => [] }
            return {
              limit: async () =>
                visible
                  ? [
                      {
                        room: {
                          id: roomId,
                          name: 'Suite',
                          code: '101',
                          status: 'available',
                          roomType: 'apartment',
                        },
                      },
                    ]
                  : [],
            }
          },
        }
        return builder
      },
    }),
  }
  f.ctx.db.mockImplementation(async (run: (tx: unknown) => unknown) => run(tx))
  return { ...f, queries, joins }
}
const roomPage = (
  overrides: Partial<{
    propertyId: string
    buildingId: string
    floorId: string
    roomId: string
  }> = {},
) =>
  RoomPage({ params: Promise.resolve({ propertyId, buildingId, floorId, roomId, ...overrides }) })
describe('room detail ancestor protection', () => {
  it('does not load maintenance or QR data when the module is disabled', async () => {
    const f = roomFixture()
    mocks.modules.mockResolvedValue(new Set())
    await roomPage()
    expect(f.queries).toHaveLength(1)
  })
  it('joins the full tenant-bound hierarchy and excludes every archived ancestor', async () => {
    const f = roomFixture()
    const rendered = nodes(await roomPage())
    expect(rendered.some((n) => n.type === 'page-header')).toBe(true)
    expect(f.queries[0]?.params).toEqual([tenant, roomId, floorId, buildingId, propertyId])
    for (const table of [
      'hospitality_rooms',
      'hospitality_floors',
      'hospitality_buildings',
      'hospitality_properties',
    ]) {
      expect(f.queries[0]?.sql).toContain(`"${table}"."deleted_at" is null`)
    }
    expect(f.joins).toHaveLength(3)
    expect(f.joins[2]?.sql).toContain(
      '"hospitality_properties"."tenant_id" = "hospitality_buildings"."tenant_id"',
    )
    expect(f.joins[2]?.sql).toContain(
      '"hospitality_properties"."id" = "hospitality_buildings"."property_id"',
    )
    expect(f.queries[1]?.sql).toContain('qr_targets')
    expect(f.queries[1]?.params).toEqual([tenant, roomId])
    expect(f.queries[2]?.sql).toContain('maintenance_issues')
    expect(f.queries[2]?.params).toEqual([tenant, roomId])
  })
  it('returns 404 and never loads issues when no active matching hierarchy exists', async () => {
    const f = roomFixture(false)
    await expect(roomPage()).rejects.toThrow('404')
    expect(f.queries).toHaveLength(1)
  })
  it.each(['propertyId', 'buildingId', 'floorId', 'roomId'])(
    'rejects invalid %s before querying',
    async (key) => {
      const f = roomFixture()
      await expect(roomPage({ [key]: 'invalid' })).rejects.toThrow('404')
      expect(f.ctx.db).not.toHaveBeenCalled()
    },
  )
  it('keeps permission and entitlement gates ahead of database access', async () => {
    const f = roomFixture()
    f.ctx.permissions.clear()
    await expect(roomPage()).rejects.toThrow()
    f.ctx.permissions.add('hospitality.read')
    mocks.entitlement.mockRejectedValueOnce(new Error('disabled'))
    await expect(roomPage()).rejects.toThrow('disabled')
    expect(f.ctx.db).not.toHaveBeenCalled()
  })
})

describe('room QR route guards', () => {
  it.each(['propertyId', 'buildingId', 'floorId', 'roomId'])(
    'rejects invalid %s before authentication or data access',
    async (key) => {
      const f = roomFixture()
      await expect(
        RoomQrPage({
          params: Promise.resolve({ propertyId, buildingId, floorId, roomId, [key]: 'invalid' }),
        }),
      ).rejects.toThrow('404')
      expect(mocks.auth).not.toHaveBeenCalled()
      expect(f.ctx.db).not.toHaveBeenCalled()
    },
  )
})
