import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { tenants } from '@beaconhs/db/schema'
import { platformTenantCounts } from './platform-tenant-counts'

describe('platform tenant count correlation', () => {
  it('retains an explicit outer tenant reference in every compiled count', () => {
    const query = drizzle
      .mock()
      .select({ tenant: tenants, ...platformTenantCounts })
      .from(tenants)
      .toSQL()
    expect(query.sql.match(/= "tenants"\."id"/g)).toHaveLength(4)
    expect(query.sql).not.toMatch(/"tenant_id" = "id"/)
    expect(query.sql).toContain('"deleted_at" is null')
    expect(query.params).toEqual([])
  })
})
