import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RequestContext } from '@beaconhs/tenant'
import type { Database } from '@beaconhs/db'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ auth: vi.fn(), overview: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.auth }))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (key: string) => key,
  getGeneratedValueTranslations: async () => (key: string) => key,
}))
vi.mock('@/app/(app)/compliance/_hub', () => ({
  obligationOverview: mocks.overview,
  kindLabel: (s: string) => s,
}))
import Page from '@/app/(app)/compliance/page'
import {
  createObligation,
  updateObligation,
  setObligationEnabled,
  deleteObligation,
} from '@/app/(app)/compliance/obligations/_actions'
import { assertTenantModuleEntitled } from './module-entitlements/server'

const tenantId = '10000000-0000-4000-8000-000000000001'
const otherTenant = '10000000-0000-4000-8000-000000000002'
const queries: { sql: string; params: unknown[] }[] = []
function context(enabled: boolean, permissions = ['compliance.read']): RequestContext {
  const tx = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          queries.push(new PgDialect().sqlToQuery(where))
          return Promise.resolve(
            enabled
              ? [
                  {
                    moduleKey: 'hospitality.compliance',
                    state: 'enabled',
                    effectiveFrom: null,
                    effectiveUntil: null,
                  },
                ]
              : [],
          )
        },
      }),
    }),
  }
  return {
    tenantId,
    isSuperAdmin: false,
    permissions: new Set(permissions),
    scopes: [{ type: 'properties', propertyIds: ['property-a'] }],
    db: vi.fn(async (fn: (tx: Database) => Promise<unknown>) => fn(tx as unknown as Database)),
  } as unknown as RequestContext
}
beforeEach(() => {
  vi.clearAllMocks()
  queries.length = 0
  mocks.overview.mockResolvedValue({
    rows: [],
    total: 0,
    page: 1,
    summary: { obligations: 0, subjects: 0, completed: 0, overdue: 0 },
  })
})
describe('Compliance entitlement boundary', () => {
  it('denies direct overview before Compliance data, even for a super admin', async () => {
    mocks.auth.mockResolvedValue({ ...context(false), isSuperAdmin: true })
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      code: 'MODULE_NOT_ENTITLED',
    })
    expect(mocks.overview).not.toHaveBeenCalled()
  })
  it('enabled module still denies a role without compliance.read', async () => {
    mocks.auth.mockResolvedValue(context(true, []))
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      name: 'ForbiddenError',
    })
    expect(mocks.overview).not.toHaveBeenCalled()
  })
  it('allows an entitled reader and retains the same property-scoped request context', async () => {
    const ctx = context(true)
    mocks.auth.mockResolvedValue(ctx)
    expect(await Page({ searchParams: Promise.resolve({}) })).toBeTruthy()
    expect(mocks.overview.mock.calls[0]?.[0]).toBe(ctx)
    expect(ctx.scopes).toEqual([{ type: 'properties', propertyIds: ['property-a'] }])
    expect(queries[0]?.params).toContain(tenantId)
  })
  it('a grant in another tenant cannot authorize the active tenant', async () => {
    const ctx = context(false)
    await expect(assertTenantModuleEntitled(ctx, 'hospitality.compliance')).rejects.toMatchObject({
      code: 'MODULE_NOT_ENTITLED',
    })
    expect(queries[0]?.params).toContain(tenantId)
    expect(queries[0]?.params).not.toContain(otherTenant)
  })
  it('denies all four mutations before parsing or mutation work', async () => {
    const ctx = context(false, ['compliance.assign', 'compliance.manage'])
    mocks.auth.mockResolvedValue(ctx)
    const attempts = [
      () => createObligation({} as never),
      () => updateObligation('invalid', {} as never),
      () => setObligationEnabled('invalid', true),
      () => deleteObligation('invalid'),
    ]
    for (const attempt of attempts)
      await expect(attempt()).rejects.toMatchObject({ code: 'MODULE_NOT_ENTITLED' })
    expect(ctx.db).toHaveBeenCalledTimes(4)
  })
})

it.each([
  () => import('@/app/(app)/compliance/aging/page'),
  () => import('@/app/(app)/compliance/by-person/page'),
  () => import('@/app/(app)/compliance/expiring/page'),
  () => import('@/app/(app)/compliance/mine/page'),
  () => import('@/app/(app)/compliance/obligations/page'),
  () => import('@/app/(app)/compliance/obligations/[id]/page'),
])('denies every remaining direct Compliance page before data loading', async (load) => {
  mocks.auth.mockResolvedValue(context(false, ['compliance.read', 'compliance.manage']))
  const { default: page } = await load()
  await expect(
    page({
      params: Promise.resolve({ id: '20000000-0000-4000-8000-000000000001' }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toMatchObject({ code: 'MODULE_NOT_ENTITLED' })
})
