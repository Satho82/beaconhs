import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { SLIPS_TRIPS_TEMPLATE } from './risk-library'
import {
  formatRiskCatalogueDiagnostic,
  installStandardRiskLibrary,
  planRiskCatalogueInstall,
  RiskCatalogueInstallError,
} from './risk-library-install'
import { RISK_CATALOGUE_TEMPLATES } from './risk-catalogue'
import type { riskTemplates } from './schema'
import type { Database } from './client'

function installed(): (typeof riskTemplates.$inferSelect)[] {
  return RISK_CATALOGUE_TEMPLATES.map((row) => ({
    ...structuredClone(row),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  })) satisfies (typeof riskTemplates.$inferSelect)[]
}

function fixture(existing: (typeof riskTemplates.$inferSelect)[], conflict = false) {
  const insert = vi.fn().mockImplementation(() => ({
    values: (input: { id: string } | { id: string }[]) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          const rows = Array.isArray(input) ? input : [input]
          return conflict ? [] : rows.map((row) => ({ id: row.id }))
        },
      }),
    }),
  }))
  const execute = vi.fn()
  const tx = { execute, select: () => ({ from: () => ({ where: async () => existing }) }), insert }
  const db = {
    transaction: async (fn: (value: unknown) => unknown) => fn(tx),
  } as unknown as Database
  return { db, insert, execute }
}

describe('standard Risk Library installation', () => {
  it('provisions the standard template and its family without enabling the new catalogue', async () => {
    const writes: { table: string; value: Record<string, unknown> }[] = []
    const db = {
      insert: (table: Parameters<typeof getTableName>[0]) => ({
        values: (value: Record<string, unknown>) => ({
          onConflictDoNothing: async () => {
            writes.push({ table: getTableName(table), value })
          },
        }),
      }),
    } as unknown as Database
    await installStandardRiskLibrary(db)
    expect(writes.map((row) => row.table)).toEqual(['risk_template_families', 'risk_templates'])
    expect(writes.map((row) => row.value.id)).toEqual([
      SLIPS_TRIPS_TEMPLATE.id,
      SLIPS_TRIPS_TEMPLATE.id,
    ])
    expect(writes[1]!.value.templateFamilyId).toBe(SLIPS_TRIPS_TEMPLATE.id)
  })
  it('plans exactly 50 inserts and is idempotent for identical existing versions', () => {
    expect(planRiskCatalogueInstall([])).toHaveLength(50)
    expect(planRiskCatalogueInstall(installed())).toEqual([])
  })
  it('identifies the retained legacy Slips, Trips and Falls row as an RA-002 title/version collision', () => {
    const legacy = {
      ...structuredClone(SLIPS_TRIPS_TEMPLATE),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as typeof riskTemplates.$inferSelect
    expect(legacy.title).toBe('Slips, Trips and Falls')
    expect(legacy.version).toBe('1.0')
    expect(legacy.id).not.toBe(RISK_CATALOGUE_TEMPLATES[1]!.id)
    expect(RISK_CATALOGUE_TEMPLATES[1]!.version).toBe('1.1')
    expect(planRiskCatalogueInstall([legacy])).toHaveLength(50)
    expect(planRiskCatalogueInstall([...installed(), legacy])).toEqual([])
    expect(legacy).toMatchObject({
      id: SLIPS_TRIPS_TEMPLATE.id,
      version: '1.0',
      title: 'Slips, Trips and Falls',
      hazards: SLIPS_TRIPS_TEMPLATE.hazards,
    })
    const catalogueVersions = new Map<string, string[]>()
    for (const row of [...RISK_CATALOGUE_TEMPLATES, legacy]) {
      const key = `${row.scope}\u0000${row.tenantId ?? ''}\u0000${row.title}`
      catalogueVersions.set(key, [...(catalogueVersions.get(key) ?? []), row.version])
    }
    expect(
      [...catalogueVersions.values()].every(
        (versions) => new Set(versions).size === versions.length,
      ),
    ).toBe(true)
  })
  it('formats database failures without exposing driver messages or values', () => {
    const error = new RiskCatalogueInstallError({
      operation: 'insert_row',
      classification: 'integrity_constraint_violation',
      reference: 'RA-002',
      sqlState: '23505',
      constraint: 'risk_templates_platform_title_version_ux',
    })
    expect(formatRiskCatalogueDiagnostic(error)).toContain('sqlstate=23505')
    expect(formatRiskCatalogueDiagnostic(error)).not.toContain('password')
  })
  it('does not reactivate retired or deleted records', () => {
    const rows = installed()
    rows[0]!.state = 'retired'
    rows[1]!.deletedAt = new Date()
    expect(planRiskCatalogueInstall(rows)).toEqual([])
    expect(rows[0]!.state).toBe('retired')
    expect(rows[1]!.deletedAt).not.toBeNull()
  })
  it.each(['id', 'title', 'description', 'ownerKey', 'tenantId', 'version'] as const)(
    'rejects conflicting %s without mutating existing records',
    (key) => {
      const rows = installed()
      const row = rows[0]!
      Object.assign(row, { [key]: 'conflicting-value' })
      const before = structuredClone(rows)
      expect(() => planRiskCatalogueInstall(rows)).toThrow(RiskCatalogueInstallError)
      expect(rows).toEqual(before)
    },
  )
  it('rejects altered hazard content at the same version', () => {
    const rows = installed()
    rows[0]!.hazards[0]!.harm = 'Different evidence'
    expect(() => planRiskCatalogueInstall(rows)).toThrow(RiskCatalogueInstallError)
  })
  it('ignores tenant-owned titles and older master versions with different identities', () => {
    const rows = installed().slice(0, 2)
    rows[0]!.id = 'other-id'
    rows[0]!.scope = 'tenant'
    rows[0]!.tenantId = 'tenant-a'
    rows[1]!.id = 'old-master-id'
    rows[1]!.version = '0.9'
    expect(planRiskCatalogueInstall(rows)).toHaveLength(50)
  })
  it('checks conflicts before insert inside the transaction (test double only)', async () => {
    const rows = installed()
    rows[0]!.title = 'Conflict'
    const f = fixture(rows)
    await expect(
      installStandardRiskLibrary(f.db, { catalogue: 'uvanoo-v1.4' }),
    ).rejects.toBeInstanceOf(RiskCatalogueInstallError)
    expect(f.execute).toHaveBeenCalledOnce()
    expect(f.insert).not.toHaveBeenCalled()
  })
  it('inserts only missing rows and rejects an unexpected concurrent insert conflict', async () => {
    const f = fixture(installed().slice(0, 49))
    await expect(installStandardRiskLibrary(f.db, { catalogue: 'uvanoo-v1.4' })).resolves.toEqual({
      inserted: 1,
      retained: 49,
    })
    expect(f.insert).toHaveBeenCalledTimes(2)
    await expect(
      installStandardRiskLibrary(fixture([], true).db, { catalogue: 'uvanoo-v1.4' }),
    ).rejects.toMatchObject({ classification: 'concurrent_or_unique_key_conflict' })
  })
  it('keeps all approved catalogue inserts inside one atomic transaction on failure', async () => {
    let transactionCount = 0
    let insertCount = 0
    const tx = {
      execute: vi.fn(),
      select: () => ({ from: () => ({ where: async () => [] }) }),
      insert: () => ({
        values: (input: { id: string }) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              insertCount += 1
              if (input.id === RISK_CATALOGUE_TEMPLATES[2]!.id) return []
              return [{ id: input.id }]
            },
          }),
        }),
      }),
    }
    const db = {
      transaction: async (fn: (value: unknown) => unknown) => {
        transactionCount += 1
        return fn(tx)
      },
    } as unknown as Database
    await expect(
      installStandardRiskLibrary(db, { catalogue: 'uvanoo-v1.4' }),
    ).rejects.toMatchObject({
      operation: 'insert_verify',
      classification: 'concurrent_or_unique_key_conflict',
      reference: 'RA-003',
    })
    expect(transactionCount).toBe(1)
    expect(insertCount).toBe(3)
  })
  it('installs alongside the untouched legacy row and repeats idempotently', async () => {
    const legacy = {
      ...structuredClone(SLIPS_TRIPS_TEMPLATE),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as typeof riskTemplates.$inferSelect
    const rows = [legacy]
    let transactions = 0
    const tx = {
      execute: vi.fn(),
      select: () => ({ from: () => ({ where: async () => rows }) }),
      insert: () => ({
        values: (input: typeof riskTemplates.$inferInsert) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              rows.push({
                ...structuredClone(input),
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
              } as typeof riskTemplates.$inferSelect)
              return [{ id: input.id! }]
            },
          }),
        }),
      }),
    }
    const db = {
      transaction: async (fn: (value: unknown) => unknown) => {
        transactions += 1
        return fn(tx)
      },
    } as unknown as Database
    await expect(installStandardRiskLibrary(db, { catalogue: 'uvanoo-v1.4' })).resolves.toEqual({
      inserted: 50,
      retained: 0,
    })
    await expect(installStandardRiskLibrary(db, { catalogue: 'uvanoo-v1.4' })).resolves.toEqual({
      inserted: 0,
      retained: 50,
    })
    expect(transactions).toBe(2)
    expect(rows).toHaveLength(51)
    expect(rows.find((row) => row.id === SLIPS_TRIPS_TEMPLATE.id)).toMatchObject({
      id: SLIPS_TRIPS_TEMPLATE.id,
      title: 'Slips, Trips and Falls',
      version: '1.0',
      hazards: SLIPS_TRIPS_TEMPLATE.hazards,
    })
    expect(rows.find((row) => row.id === RISK_CATALOGUE_TEMPLATES[1]!.id)?.version).toBe('1.1')
  })
  it('has no update/delete path', () => {
    const source = readFileSync(new URL('./risk-library-install.ts', import.meta.url), 'utf8')
    expect(source).toContain('.onConflictDoNothing()')
    expect(source).not.toMatch(/\.(update|delete)\(/)
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
