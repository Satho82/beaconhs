import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'

const state = vi.hoisted(() => ({ statements: [] as unknown[] }))
vi.mock('@beaconhs/db', async (original) => ({
  ...(await original<typeof import('@beaconhs/db')>()),
  withTenant: async (_db: unknown, _tenant: string, run: (tx: unknown) => Promise<unknown>) =>
    run({
      execute: async (statement: unknown) => {
        state.statements.push(statement)
      },
    }),
}))
import { makeTenantContext } from '@beaconhs/tenant'

const base: Omit<RequestContext, 'db'> = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  userId: 'manager',
  isSuperAdmin: false,
  timezone: 'Europe/London',
  locale: 'en',
  defaultLocale: 'en',
  enabledLocales: ['en'],
  localeOverride: null,
  membership: { id: 'manager-member', displayName: 'Manager' },
  personId: null,
  permissions: new Set(['ca.read.all', 'ca.update']),
  scopes: [],
}
const fenchurch = '20000000-0000-4000-8000-000000000001'
const lincoln = '20000000-0000-4000-8000-000000000002'

async function scope(args: Partial<typeof base>) {
  const ctx = makeTenantContext({} as Database, { ...base, ...args })
  await ctx.db(async () => {
    expect(state.statements).toHaveLength(1)
  })
  return new PgDialect().sqlToQuery(state.statements[0] as Parameters<PgDialect['sqlToQuery']>[0])
}

describe('Action scope on every authenticated transaction', () => {
  beforeEach(() => {
    state.statements = []
  })
  it('ca.read.all does not widen a Fenchurch manager’s property assignment', async () => {
    expect(
      (await scope({ scopes: [{ type: 'properties', propertyIds: [fenchurch] }] })).params,
    ).toEqual(['property', JSON.stringify([fenchurch])])
  })
  it('allows the Cluster GM’s two assigned properties', async () => {
    expect(
      (await scope({ scopes: [{ type: 'properties', propertyIds: [fenchurch, lincoln] }] })).params,
    ).toEqual(['property', JSON.stringify([fenchurch, lincoln])])
  })
  it('preserves Lincoln-only and operational-user scope', async () => {
    expect(
      (
        await scope({
          permissions: new Set(['ca.read.self']),
          scopes: [{ type: 'properties', propertyIds: [lincoln] }],
        })
      ).params,
    ).toEqual(['property', JSON.stringify([lincoln])])
  })
  it('fails closed for an empty property assignment', async () => {
    expect((await scope({ scopes: [{ type: 'properties', propertyIds: [] }] })).params).toEqual([
      'property',
      '[]',
    ])
  })
  it('keeps explicit tenant administration within the active tenant', async () => {
    expect((await scope({ scopes: [{ type: 'tenant' }] })).params).toEqual(['tenant', '[]'])
  })
  it('preserves legitimate platform administration', async () => {
    expect((await scope({ isSuperAdmin: true })).params).toEqual(['tenant', '[]'])
  })
  it('does not give a legacy site role property-wide privileges', async () => {
    expect((await scope({ scopes: [{ type: 'sites', siteIds: ['site'] }] })).params).toEqual([
      'legacy',
      '[]',
    ])
  })
})
