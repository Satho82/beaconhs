import { describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readMigrationFiles } from './migration-state'
import { verifyPreparedRisk } from './verify-prepared-risk'

// These tests exercise the historical 58-to-61 adoption contract. Later
// migrations must neither change that fixture nor widen its live ledger gate.
vi.mock('./migration-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./migration-state')>()
  return {
    ...actual,
    readMigrationFiles: vi.fn((folder: string) => actual.readMigrationFiles(folder).slice(0, 61)),
  }
})

const ledger = readMigrationFiles(fileURLToPath(new URL('../drizzle', import.meta.url))).map(
  (e) => ({ hash: e.hash, created_at: e.createdAt }),
)
function fixture(
  change: {
    ledger?: typeof ledger
    database?: string
    readonly?: string
    security?: boolean
    inventory?: boolean
    bypass?: boolean
  } = {},
) {
  const queries: string[] = []
  const make =
    (kind: 'migration' | 'runtime' | 'maintenance') =>
    async (run: (q: (s: string) => Promise<Array<Record<string, unknown>>>) => Promise<void>) =>
      run(async (s) => {
        queries.push(s)
        if (s.includes('session_user AS login'))
          return [
            {
              database: change.database ?? 'beaconhs_clean155_final',
              login: {
                migration: 'beaconhs_migrator',
                runtime: 'beaconhs_app',
                maintenance: 'beaconhs_super',
              }[kind],
              read_only: change.readonly ?? 'on',
              rolsuper: false,
              rolbypassrls: kind === 'runtime' ? (change.bypass ?? false) : kind === 'maintenance',
              owner_member: kind === 'migration',
            },
          ]
        if (s.includes('SELECT hash,created_at')) return change.ledger ?? ledger
        if (s.includes('pg_trigger')) return [{ ready: change.security ?? true }]
        if (s.includes('FROM tenants')) return [{ ready: change.inventory ?? true }]
        if (s === 'SET LOCAL ROLE beaconhs_owner') return []
        throw Error('Unrecognized query')
      })
  return {
    connections: {
      migration: make('migration'),
      runtime: make('runtime'),
      maintenance: make('maintenance'),
    },
    queries,
  }
}
describe('read-only prepared DEV adoption gate', () => {
  it('accepts only exact 0061 candidate without mutation statements', async () => {
    const f = fixture()
    await verifyPreparedRisk(f.connections)
    expect(f.queries.length).toBe(7)
    for (const q of f.queries)
      expect(q).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\b/i)
  })
  it('rejects0058 rather than migrating it', async () => {
    await expect(
      verifyPreparedRisk(fixture({ ledger: ledger.slice(0, 58) }).connections),
    ).rejects.toThrow('ledger')
  })
  it('rejects wrong hash and additional ledger rows', async () => {
    await expect(
      verifyPreparedRisk(
        fixture({ ledger: ledger.map((r, i) => (i === 60 ? { ...r, hash: 'wrong' } : r)) })
          .connections,
      ),
    ).rejects.toThrow('ledger')
    await expect(
      verifyPreparedRisk(fixture({ ledger: [...ledger, ledger[60]!] }).connections),
    ).rejects.toThrow('ledger')
  })
  it.each([{ database: 'beaconhs' }, { readonly: 'off' }, { bypass: true }])(
    'rejects unsafe connection %j',
    async (change) => {
      await expect(verifyPreparedRisk(fixture(change).connections)).rejects.toThrow('identity')
    },
  )
  it.each([{ security: false }, { inventory: false }])(
    'rejects security/inventory drift %j',
    async (change) => {
      await expect(verifyPreparedRisk(fixture(change).connections)).rejects.toThrow('rejected')
    },
  )
})

it('rejects a real later migration row instead of widening the exact-61 ledger gate', async () => {
  const actual = await vi.importActual<typeof import('./migration-state')>('./migration-state')
  const current = actual.readMigrationFiles(fileURLToPath(new URL('../drizzle', import.meta.url)))
  expect(current).toHaveLength(63)
  await expect(
    verifyPreparedRisk(
      fixture({
        ledger: current.map((entry) => ({ hash: entry.hash, created_at: entry.createdAt })),
      }).connections,
    ),
  ).rejects.toThrow('ledger')
})
