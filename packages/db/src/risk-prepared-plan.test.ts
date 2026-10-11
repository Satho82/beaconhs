import { describe, expect, it } from 'vitest'
import { preparedRiskPlan } from './risk-prepared-plan'

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
    expect(plan).toContain('967e01c579434a1230124f1659ac451bd4834a46106d27261a7e2fc61e4ba602')
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
    expect(plan).toContain('Ordinary migrate.ts remains incompatible')
  })
})
