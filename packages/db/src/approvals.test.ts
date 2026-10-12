import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'
import { PERMISSION_CATALOGUE } from './schema/iam'

const proposal = readFileSync(
  new URL('../proposals/approvals-batch01.sql', import.meta.url),
  'utf8',
)
const tables = [
  'approval_workflows',
  'approval_requests',
  'approval_stages',
  'approval_decisions',
  'approval_events',
]
describe('Additive Approvals database proposal', () => {
  it('registers all five tenant/property scoped tables without permissive fallback', () => {
    for (const table of tables) {
      expect(TENANT_SCOPED_TABLES).toContain(table)
      const policy = RLS_POLICY_SQL(table)
      expect(policy).toContain('FORCE ROW LEVEL SECURITY')
      expect(policy).toContain(`p.tenant_id=${table}.tenant_id`)
      expect(policy).toContain(`p.id=${table}.property_id`)
      expect(policy).toContain("'property'")
      expect(policy).not.toContain("'legacy'")
    }
  })
  it('adds only the five engine tables with no cross-module source FK', () => {
    expect([...proposal.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1])).toEqual(tables)
    expect(proposal).not.toMatch(/REFERENCES (risk_|people|maintenance_|tasks|flow_gates)/)
    expect(proposal).not.toMatch(/ALTER TABLE (risk_|people|manager_signoffs|audit_log)/)
    expect(proposal).not.toMatch(/SECURITY DEFINER/)
  })
  it('keeps transition, evidence and audit guards inside PostgreSQL', () => {
    expect(proposal).toContain('FOR UPDATE')
    expect(proposal).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(proposal).toContain('BEFORE TRUNCATE')
    expect(proposal).toContain('approval_event_guard')
    expect(proposal).toContain('approval_decision_guard')
    expect(proposal).toContain("jsonb_build_object('audit',to_jsonb(a))")
  })
  it('registers explicit engine permissions with the existing RBAC catalogue', () => {
    expect(PERMISSION_CATALOGUE).toEqual(
      expect.arrayContaining([
        'approvals.read',
        'approvals.submit',
        'approvals.decide',
        'approvals.configure',
      ]),
    )
  })
})
