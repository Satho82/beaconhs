import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { installStandardRiskLibrary } from './risk-library-install'
import { SLIPS_TRIPS_TEMPLATE } from './risk-library'

describe('standard Risk Library installation', () => {
  it('only inserts the shipped platform template and ignores existing versions', () => {
    // Compiling a query does not establish a database connection.
    const client = postgres('postgres://unused:unused@127.0.0.1:1/unused')
    const query = installStandardRiskLibrary(drizzle(client)).toSQL()
    expect(query.sql).toMatch(/^insert into "risk_templates"/)
    expect(query.sql).toContain('on conflict do nothing')
    expect(query.sql).not.toContain('do update')
    expect(query.params).toContain(SLIPS_TRIPS_TEMPLATE.id)
    expect(query.params).toContain('platform')
    expect(query.params).toContain('Slips, Trips and Falls')
    expect(query.params).toContain('1.0')
  })

  it('runs in the normal migration path after security invariants, without demo seeding', () => {
    const source = readFileSync(new URL('./migrate.ts', import.meta.url), 'utf8')
    const security = source.indexOf('await assertKioskPinHashes(maintenanceDb)')
    const install = source.indexOf('await installStandardRiskLibrary(maintenanceDb)')
    expect(security).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(security)
    expect(source).not.toContain("from './seed")
    expect(source).not.toContain('seed-cycas')
  })
})
