import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { Database } from './client'
import { isTenantModuleEntitled, tenantModuleEntitlementExists } from './module-entitlements'
const key = 'hospitality.compliance'
function fixture(rows: { tenantId: string; moduleKey: string }[]) {
  const queries: ReturnType<PgDialect['sqlToQuery']>[] = []
  const tx = {
    select: () => ({
      from: () => ({
        where: (q: SQL) => {
          queries.push(new PgDialect().sqlToQuery(q))
          return { limit: async () => rows }
        },
      }),
    }),
  } as unknown as Database
  return { tx, queries }
}
describe('transaction entitlement resolver', () => {
  it.each([
    { rows: [] },
    { rows: [{ tenantId: 'other', moduleKey: key }] },
    { rows: [{ tenantId: 'tenant', moduleKey: 'hospitality.maintenance' }] },
  ])('fails closed for absent or mismatched rows %j', async ({ rows }) => {
    expect(await isTenantModuleEntitled(fixture(rows).tx, 'tenant', key)).toBe(false)
  })
  it('requires the exact tenant/key and enabled active window under caller RLS', async () => {
    const { tx, queries } = fixture([{ tenantId: 'tenant', moduleKey: key }])
    const now = new Date('2026-10-06T12:00:00Z')
    expect(await isTenantModuleEntitled(tx, 'tenant', key, now)).toBe(true)
    expect(queries[0]?.params).toEqual([
      'tenant',
      key,
      'enabled',
      now.toISOString(),
      now.toISOString(),
    ])
    expect(queries[0]?.sql).toContain('"effective_from" <=')
    expect(queries[0]?.sql).toContain('"effective_until" >')
  })
  it('batch predicate correlates tenant and retains exclusive expiry', () => {
    const q = new PgDialect().sqlToQuery(tenantModuleEntitlementExists('tenant', key))
    expect(q.params).toEqual(['tenant', key])
    expect(q.sql).toContain('effective_until')
    expect(q.sql).toContain('> now()')
  })
})
