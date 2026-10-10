import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { readMigrationFiles } from './migration-state'
import { isolated0059Statement, runIsolated0059 } from './risk-0059-runner'

const files = readMigrationFiles(fileURLToPath(new URL('../drizzle', import.meta.url)))
const ledger = files.map(({ hash, createdAt }) => ({ hash, created_at: createdAt }))

describe('isolated 0059 runner (mock transport only; no database connection)', () => {
  it('prepares exactly the reviewed enum statement outside the journal', () => {
    expect(isolated0059Statement()).toBe(
      "ALTER TYPE risk_template_state ADD VALUE IF NOT EXISTS 'draft'",
    )
    expect(files.at(-1)?.tag).toBe('0058_platform_regional_defaults')
  })

  it('puts only 0059 into one transaction after role, ledger and physical-schema checks', async () => {
    const statements: string[] = []
    const transaction = vi.fn(
      async (
        run: (
          query: (statement: string) => Promise<Array<Record<string, unknown>>>,
        ) => Promise<void>,
      ) =>
        run(async (statement) => {
          statements.push(statement)
          if (statement.includes('pg_has_role'))
            return [
              {
                can_assume: true,
                login_super: false,
                login_bypass: false,
                owner_login: false,
                owner_super: false,
                owner_bypass: false,
              },
            ]
          if (statement.includes('from drizzle.__drizzle_migrations')) return ledger
          if (statement.includes('families_absent'))
            return [{ templates_exist: true, families_absent: true, versions_absent: true }]
          return []
        }),
    )
    await runIsolated0059(transaction, 'beaconhs_owner')
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(statements.filter((statement) => statement.includes('ALTER TYPE'))).toEqual([
      isolated0059Statement(),
    ])
    expect(statements.join('\n')).not.toContain('0060')
    expect(statements.join('\n')).not.toContain('0061')
  })

  it('refuses a missing ledger or unexpected owner before any DDL', async () => {
    const statements: string[] = []
    const transport = async (
      run: (query: (statement: string) => Promise<Array<Record<string, unknown>>>) => Promise<void>,
    ) =>
      run(async (statement) => {
        statements.push(statement)
        if (statement.includes('pg_has_role'))
          return [
            {
              can_assume: true,
              login_super: false,
              login_bypass: false,
              owner_login: false,
              owner_super: false,
              owner_bypass: false,
            },
          ]
        return []
      })
    await expect(runIsolated0059(transport, 'beaconhs_owner')).rejects.toThrow(/migration history/i)
    expect(statements.some((statement) => statement.includes('ALTER TYPE'))).toBe(false)
    await expect(runIsolated0059(transport, 'owner; drop table tenants')).rejects.toThrow(
      'Invalid owner role',
    )
  })
})
