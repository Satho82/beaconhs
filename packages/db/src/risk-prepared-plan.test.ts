import { describe, expect, it, vi } from 'vitest'
import { preparedRiskPlan } from './risk-prepared-plan'
import { readMigrationFiles } from './migration-state'
import { fileURLToPath } from 'node:url'

// These tests exercise the historical 58-to-61 adoption contract. Later
// migrations must neither change that fixture nor widen its live ledger gate.
vi.mock('./migration-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./migration-state')>()
  return {
    ...actual,
    readMigrationFiles: vi.fn((folder: string) => actual.readMigrationFiles(folder).slice(0, 61)),
  }
})

describe('offline governed Risk migration plan', () => {
  it('requires an explicit safe database identity', () => {
    for (const name of ['', "db'; SELECT 1", 'postgres://secret@host/db'])
      expect(() => preparedRiskPlan(name)).toThrow()
    expect(preparedRiskPlan('beaconhs_clean155_final')).toContain(
      "current_database() <> 'beaconhs_clean155_final'",
    )
  })
  it('commits 0059 before checking enum visibility and starting 0060', () => {
    const plan = preparedRiskPlan('isolated_test')
    expect(plan.match(/^BEGIN;$/gm)).toHaveLength(3)
    expect(plan.match(/^COMMIT;$/gm)).toHaveLength(3)
    const commit = plan.indexOf('\nCOMMIT;')
    expect(plan.indexOf('ALTER TYPE')).toBeLessThan(commit)
    expect(plan.indexOf('RISK_ENUM_NOT_COMMITTED')).toBeGreaterThan(commit)
    expect(plan.indexOf('CREATE FUNCTION public.risk_matrix_snapshot_valid')).toBeGreaterThan(
      commit,
    )
  })
  it('writes reviewed tracker entries only after DDL in their transactions', () => {
    const plan = preparedRiskPlan('isolated_test')
    expect(plan.match(/INSERT INTO drizzle\.__drizzle_migrations/g)).toHaveLength(3)
    expect(plan).toContain('43d1c71e5260d03264433e8224f324ad8dc56b6dc10053b5610b6e9b27625b47')
    expect(plan).not.toMatch(/UPDATE drizzle|DELETE FROM drizzle/)
    expect(plan).toContain('RISK_LEDGER_MISMATCH')
    expect(plan).toContain('RISK_ROLE_MISMATCH')
    expect(plan).toContain('\\set ON_ERROR_STOP on')
  })
  it('keeps RLS and immutable privileges before final commit; no ordinary migration invocation', () => {
    const plan = preparedRiskPlan('isolated_test')
    const revoke = plan.indexOf(
      'REVOKE UPDATE, DELETE, TRUNCATE ON risk_assessment_versions FROM beaconhs_app,beaconhs_super',
    )
    expect(revoke).toBeGreaterThan(plan.indexOf('CREATE TRIGGER risk_signoff_revision_guard'))
    expect(revoke).toBeLessThan(plan.lastIndexOf('\nCOMMIT;'))
    expect(plan).toContain('FORCE ROW LEVEL SECURITY')
    expect(plan).toContain('ordinary migrate.ts now consumes the canonical 61-entry journal')
  })
})

it('rejects the later canonical chain for the historical adoption plan', async () => {
  const actual = await vi.importActual<typeof import('./migration-state')>('./migration-state')
  const current = actual.readMigrationFiles(fileURLToPath(new URL('../drizzle', import.meta.url)))
  expect(current).toHaveLength(67)
  vi.mocked(readMigrationFiles).mockReturnValueOnce(current)
  expect(() => preparedRiskPlan('isolated_test')).toThrow('Expected canonical 0061')
})
