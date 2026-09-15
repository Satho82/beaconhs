import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  transactionAudit: vi.fn(),
  entitlement: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({
  recordAudit: mocks.audit,
  recordAuditInTransaction: mocks.transactionAudit,
}))
vi.mock('@/lib/module-entitlements/server', () => ({
  assertTenantModuleEntitled: mocks.entitlement,
}))

import {
  archiveProperty,
  createBuilding,
  createFloor,
  createProperty,
  createRoom,
  listProperties,
  updateBuilding,
  updateFloor,
  updateRoom,
} from './properties'

const TENANT = '10000000-0000-4000-8000-000000000001'
const OTHER_TENANT = '10000000-0000-4000-8000-000000000002'
const PROPERTY = '20000000-0000-4000-8000-000000000001'
const BUILDING = '30000000-0000-4000-8000-000000000001'
const FLOOR = '40000000-0000-4000-8000-000000000001'
const ROOM = '50000000-0000-4000-8000-000000000001'
type Row = {
  id: string
  tenantId: string
  name: string
  deletedAt: Date | null
  propertyId?: string
  buildingId?: string
  floorId?: string
  code?: string
}

function fixture(permissions = ['hospitality.manage', 'hospitality.read']) {
  const rows = new Map<string, Row[]>([
    [
      'hospitality_properties',
      [{ id: PROPERTY, tenantId: TENANT, name: 'Hotel', deletedAt: null }],
    ],
  ])
  const statements: { sql: string; params: unknown[] }[] = []
  const inserted: Record<string, unknown>[] = []
  const pages: { limit: number; offset: number }[] = []
  const dialect = new PgDialect()
  const selectRows = (table: Parameters<typeof getTableName>[0], condition: SQL) => {
    const query = dialect.sqlToQuery(condition)
    statements.push(query)
    expect(query.sql).toContain('"tenant_id" =')
    expect(query.sql).toContain('"deleted_at" is null')
    return (rows.get(getTableName(table)) ?? []).filter(
      (row) =>
        row.tenantId === query.params[0] &&
        (!query.params[1] || row.id === query.params[1]) &&
        !row.deletedAt,
    )
  }
  const tx = {
    insert: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          inserted.push(values)
          return [
            {
              id: (
                {
                  hospitality_properties: PROPERTY,
                  hospitality_buildings: BUILDING,
                  hospitality_floors: FLOOR,
                  hospitality_rooms: ROOM,
                } as Record<string, string>
              )[getTableName(table)],
              ...values,
            },
          ]
        },
      }),
    })),
    select: (fields?: Record<string, unknown>) => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (condition: SQL) => {
          const selected = selectRows(table, condition)
          return Object.assign(Promise.resolve(fields ? [{ value: selected.length }] : selected), {
            limit: () =>
              Object.assign(Promise.resolve(selected.slice(0, 1)), {
                for: async (mode: string) => {
                  expect(mode).toBe('share')
                  return selected.slice(0, 1).map((row) => ({
                    id: row.id,
                    parentId: row.buildingId ?? row.propertyId ?? row.id,
                  }))
                },
              }),
            orderBy: () => ({
              limit: (limit: number) => ({
                offset: async (offset: number) => {
                  pages.push({ limit, offset })
                  return selected.slice(offset, offset + limit)
                },
              }),
            }),
          })
        },
      }),
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: SQL) => ({
          returning: async () => {
            const selected = selectRows(table, condition)
            return selected.map((row) => Object.assign(row, values))
          },
        }),
      }),
    }),
  } as unknown as Database
  const db = vi.fn(async (run: Parameters<RequestContext['db']>[0]) => {
    const before = inserted.length
    try {
      return await run(tx)
    } catch (error) {
      inserted.splice(before)
      throw error
    }
  })
  const ctx: RequestContext = {
    tenantId: TENANT,
    userId: 'user-1',
    isSuperAdmin: false,
    timezone: 'Europe/London',
    locale: 'en',
    defaultLocale: 'en',
    enabledLocales: ['en'],
    localeOverride: null,
    membership: null,
    personId: null,
    scopes: [],
    permissions: new Set(permissions),
    db: db as RequestContext['db'],
  }
  return { ctx, rows, statements, inserted, db, pages, tx }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transactionAudit.mockImplementation(async (_tx, ctx, event) => mocks.audit(ctx, event))
})

describe('hospitality property authorization and persistence boundary', () => {
  it('creates a validated property for the authenticated tenant and audits it', async () => {
    const f = fixture()
    const row = await createProperty(f.ctx, {
      name: ' Hotel ',
      code: ' LON ',
      timezone: ' Europe/London ',
      tenantId: OTHER_TENANT,
    } as Parameters<typeof createProperty>[1] & { tenantId: string })
    expect(f.inserted).toEqual([
      { tenantId: TENANT, name: 'Hotel', code: 'LON', timezone: 'Europe/London' },
    ])
    expect(row.id).toBe(PROPERTY)
    expect(mocks.entitlement).toHaveBeenCalledWith(f.ctx, 'hospitality.properties')
    expect(mocks.audit).toHaveBeenCalledWith(
      f.ctx,
      expect.objectContaining({ action: 'create', entityId: PROPERTY }),
    )
  })

  it('rejects unauthorized creation before touching the database', async () => {
    const f = fixture(['hospitality.read'])
    await expect(
      createProperty(f.ctx, { name: 'Hotel', code: 'LON', timezone: 'UTC' }),
    ).rejects.toThrow()
    expect(f.db).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('rejects a disabled property entitlement even for a manager', async () => {
    const f = fixture()
    mocks.entitlement.mockRejectedValueOnce(new Error('Module disabled'))
    await expect(
      createProperty(f.ctx, { name: 'Hotel', code: 'LON', timezone: 'UTC' }),
    ).rejects.toThrow('Module disabled')
    expect(f.db).not.toHaveBeenCalled()
  })

  it.each([
    { name: '', code: 'LON', timezone: 'UTC' },
    { name: 'Hotel', code: 'x'.repeat(81), timezone: 'UTC' },
    { name: 'Hotel', code: 'LON', timezone: 'Not/AZone' },
  ])('rejects invalid property fields', async (input) => {
    const f = fixture()
    await expect(createProperty(f.ctx, input)).rejects.toThrow()
    expect(f.db).not.toHaveBeenCalled()
  })

  it('lists only active properties in the current tenant', async () => {
    const f = fixture()
    f.rows
      .get('hospitality_properties')!
      .push(
        { id: BUILDING, tenantId: OTHER_TENANT, name: 'Other hotel', deletedAt: null },
        { id: FLOOR, tenantId: TENANT, name: 'Archived', deletedAt: new Date() },
      )
    expect((await listProperties(f.ctx)).properties.map((row) => row.id)).toEqual([PROPERTY])
  })

  it('bounds property pages and reports the full active count', async () => {
    const f = fixture()
    for (let i = 0; i < 30; i++) {
      f.rows.get('hospitality_properties')!.push({
        id: `property-${i}`,
        tenantId: TENANT,
        name: `Hotel ${i}`,
        deletedAt: null,
      })
    }
    const result = await listProperties(f.ctx, { page: '2', perPage: '10' })
    expect(result.total).toBe(31)
    expect(result.properties).toHaveLength(10)
    expect(f.pages).toEqual([{ limit: 10, offset: 10 }])
    await listProperties(f.ctx, { perPage: '1000000', page: '-1' })
    expect(f.pages[1]).toEqual({ limit: 100, offset: 0 })
  })

  it('applies the same tenant-scoped search to the count and page', async () => {
    const f = fixture()
    await listProperties(f.ctx, { q: 'Hotel' })
    expect(f.statements).toHaveLength(2)
    expect(f.statements[0]).toEqual(f.statements[1])
    expect(f.statements[0]?.sql).toContain('ilike')
    expect(f.statements[0]?.params).toEqual([TENANT, '%Hotel%', '%Hotel%'])
  })

  it('requires management permission to archive', async () => {
    const f = fixture(['hospitality.read'])
    await expect(archiveProperty(f.ctx, PROPERTY)).rejects.toThrow()
    expect(f.db).not.toHaveBeenCalled()
  })

  it('soft-deletes and audits an authorized property without deleting its history', async () => {
    const f = fixture()
    const row = await archiveProperty(f.ctx, PROPERTY)
    expect(row.deletedAt).toBeInstanceOf(Date)
    expect(f.rows.get('hospitality_properties')).toHaveLength(1)
    expect(mocks.audit).toHaveBeenCalledWith(
      f.ctx,
      expect.objectContaining({ action: 'archive', entityId: PROPERTY }),
    )
    await expect(archiveProperty(f.ctx, PROPERTY)).rejects.toThrow('No property')
  })

  it('cannot archive another tenant’s property', async () => {
    const f = fixture()
    f.rows.get('hospitality_properties')![0]!.tenantId = OTHER_TENANT
    await expect(archiveProperty(f.ctx, PROPERTY)).rejects.toThrow('No property')
    expect(f.statements[0]?.params).toEqual([TENANT, PROPERTY])
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it.each(['', 'new', 'not-a-uuid'])(
    'rejects invalid property identifier %s before querying',
    async (id) => {
      const f = fixture()
      await expect(archiveProperty(f.ctx, id)).rejects.toThrow('Invalid property identifier')
      await expect(createBuilding(f.ctx, id, 'Wing', 'W')).rejects.toThrow(
        'Invalid property identifier',
      )
      expect(f.db).not.toHaveBeenCalled()
    },
  )

  it('rejects missing or cross-tenant parents before creating child records', async () => {
    const f = fixture()
    f.rows.get('hospitality_properties')![0]!.tenantId = OTHER_TENANT
    await expect(createBuilding(f.ctx, PROPERTY, 'Wing', 'W')).rejects.toThrow('No property')
    await expect(createFloor(f.ctx, BUILDING, 'Floor', 'F')).rejects.toThrow('No building')
    await expect(createRoom(f.ctx, FLOOR, '1')).rejects.toThrow('No floor')
    expect(f.inserted).toEqual([])
  })

  it('rejects edits under missing parents', async () => {
    const f = fixture()
    await expect(updateBuilding(f.ctx, BUILDING, BUILDING, 'Wing', 'W')).rejects.toThrow(
      'No property',
    )
    await expect(updateFloor(f.ctx, BUILDING, FLOOR, 'Floor', 'F')).rejects.toThrow('No building')
    await expect(updateRoom(f.ctx, FLOOR, ROOM, '1')).rejects.toThrow('No floor')
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})

function hierarchy() {
  const f = fixture()
  f.rows.set('hospitality_buildings', [
    {
      id: BUILDING,
      tenantId: TENANT,
      propertyId: PROPERTY,
      name: 'Wing',
      code: 'W',
      deletedAt: null,
    },
  ])
  f.rows.set('hospitality_floors', [
    {
      id: FLOOR,
      tenantId: TENANT,
      buildingId: BUILDING,
      name: 'First floor',
      code: 'F1',
      deletedAt: null,
    },
  ])
  f.rows.set('hospitality_rooms', [
    { id: ROOM, tenantId: TENANT, floorId: FLOOR, name: 'Suite', code: '101', deletedAt: null },
  ])
  return f
}
const mutations = [
  {
    name: 'create building',
    run: (ctx: RequestContext) => createBuilding(ctx, PROPERTY, 'Wing', 'W'),
    ancestors: ['properties'],
  },
  {
    name: 'update building',
    run: (ctx: RequestContext) => updateBuilding(ctx, PROPERTY, BUILDING, 'Wing', 'W'),
    ancestors: ['properties'],
  },
  {
    name: 'create floor',
    run: (ctx: RequestContext) => createFloor(ctx, BUILDING, 'Floor', 'F'),
    ancestors: ['buildings', 'properties'],
  },
  {
    name: 'update floor',
    run: (ctx: RequestContext) => updateFloor(ctx, BUILDING, FLOOR, 'Floor', 'F'),
    ancestors: ['buildings', 'properties'],
  },
  {
    name: 'create room',
    run: (ctx: RequestContext) => createRoom(ctx, FLOOR, '101', 'Suite', 'apartment'),
    ancestors: ['floors', 'buildings', 'properties'],
  },
  {
    name: 'update room',
    run: (ctx: RequestContext) => updateRoom(ctx, FLOOR, ROOM, '101', 'Suite', 'apartment'),
    ancestors: ['floors', 'buildings', 'properties'],
  },
]
describe('hierarchy ancestor integrity', () => {
  for (const mutation of mutations) {
    for (const ancestor of mutation.ancestors) {
      it.each(['archived', 'missing', 'other tenant'])(
        `${mutation.name} rejects ${ancestor} that are %s`,
        async (state) => {
          const f = hierarchy()
          const table = `hospitality_${ancestor}`
          if (state === 'missing') f.rows.delete(table)
          else if (state === 'archived') f.rows.get(table)![0]!.deletedAt = new Date()
          else f.rows.get(table)![0]!.tenantId = OTHER_TENANT
          const before = JSON.stringify([...f.rows])
          await expect(mutation.run(f.ctx)).rejects.toThrow('No ')
          expect(f.inserted).toEqual([])
          expect(JSON.stringify([...f.rows])).toBe(before)
          expect(mocks.audit).not.toHaveBeenCalled()
          expect(mocks.transactionAudit).not.toHaveBeenCalled()
          expect(f.db).toHaveBeenCalledTimes(1)
        },
      )
    }
    it(`${mutation.name} succeeds with active ancestors in one audited transaction`, async () => {
      const f = hierarchy()
      await mutation.run(f.ctx)
      expect(f.db).toHaveBeenCalledTimes(1)
      expect(mocks.transactionAudit).toHaveBeenCalledTimes(1)
      expect(mocks.transactionAudit.mock.calls[0]?.[0]).toBe(f.tx)
      expect(mocks.transactionAudit.mock.calls[0]?.[1]).toBe(f.ctx)
      expect(f.statements.slice(0, mutation.ancestors.length).map((q) => q.params)).toEqual(
        mutation.ancestors.map((ancestor) => [
          TENANT,
          ({ properties: PROPERTY, buildings: BUILDING, floors: FLOOR } as Record<string, string>)[
            ancestor
          ],
        ]),
      )
    })
    it(`${mutation.name} denies readers before querying`, async () => {
      const f = hierarchy()
      f.ctx.permissions.delete('hospitality.manage')
      await expect(mutation.run(f.ctx)).rejects.toThrow()
      expect(f.db).not.toHaveBeenCalled()
    })
  }
})
const creations = [
  {
    name: 'property',
    id: PROPERTY,
    run: (ctx: RequestContext) =>
      createProperty(ctx, { name: 'Hotel', code: 'H', timezone: 'UTC' }),
  },
  { name: 'building', id: BUILDING, run: mutations[0]!.run },
  { name: 'floor', id: FLOOR, run: mutations[2]!.run },
  { name: 'room', id: ROOM, run: mutations[4]!.run },
]
describe('hierarchy creation audit evidence', () => {
  it.each(creations)(
    'audits $name with its persisted ID and tenant context',
    async ({ name, id, run }) => {
      const f = hierarchy()
      const result = await run(f.ctx)
      expect(Array.isArray(result) ? result[0]?.id : result.id).toBe(id)
      expect(mocks.transactionAudit).toHaveBeenCalledWith(
        f.tx,
        f.ctx,
        expect.objectContaining({
          entityType: `hospitality_${name}`,
          entityId: id,
          action: 'create',
        }),
      )
      expect(f.db).toHaveBeenCalledTimes(1)
    },
  )
  it.each(creations)(
    'rejects $name creation and rolls back its transaction on audit failure',
    async ({ run }) => {
      const f = hierarchy()
      mocks.transactionAudit.mockRejectedValueOnce(new Error('Audit unavailable'))
      await expect(run(f.ctx)).rejects.toThrow('Audit unavailable')
      expect(f.inserted).toEqual([])
      expect(f.db).toHaveBeenCalledTimes(1)
      expect(mocks.transactionAudit.mock.calls[0]?.[0]).toBe(f.tx)
    },
  )
  it.each(creations)('does not audit $name when insertion fails', async ({ run }) => {
    const f = hierarchy()
    vi.mocked(f.tx.insert).mockImplementationOnce(() => {
      throw new Error('Insert failed')
    })
    await expect(run(f.ctx)).rejects.toThrow('Insert failed')
    expect(mocks.transactionAudit).not.toHaveBeenCalled()
  })
})
