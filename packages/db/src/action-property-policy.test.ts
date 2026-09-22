import { describe, expect, it } from 'vitest'
import { RLS_POLICY_SQL } from './rls'
import { REPORT_VIEWS_SQL } from './views'
import { readFileSync } from 'node:fs'

describe('shared Action authorization deployment contracts', () => {
  it('enforces property scope on both reads and writes, beneath Action permission tiers', () => {
    const policy = RLS_POLICY_SQL('corrective_actions')
    expect(policy).toContain("current_setting('app.action_property_ids', true)")
    expect(policy).toContain('USING (tenant_id =')
    expect(policy).toContain('WITH CHECK (tenant_id =')
    expect(policy).toContain('assignment.scope')
    expect(policy).toContain("member.status='active'")
    expect(policy).toContain('risk_assessments')
    expect(policy).toContain('operational_task_schedules')
    expect(policy).toContain('inspection_records')
    expect(policy).toContain('maintenance_issues')
    expect(policy).toContain('compliance_obligations')
    expect(policy).toContain('incidents')
  })
  it('protects evidence, completion and audit rows through their parent Action', () => {
    for (const table of ['ca_photos', 'ca_complete_steps', 'audit_log']) {
      expect(RLS_POLICY_SQL(table)).toContain('SELECT 1 FROM corrective_actions a')
    }
  })
  it('makes report access use the caller rather than the view owner', () => {
    expect(REPORT_VIEWS_SQL.join('\n')).toContain(
      'report_corrective_actions WITH (security_invoker = true)',
    )
  })
  it('retains a rollback-only integration suite for deployment CI', () => {
    const fixture = readFileSync(
      new URL('./action-property-rls.integration.sql', import.meta.url),
      'utf8',
    )
    expect(fixture).toContain('SET LOCAL ROLE uvanoo_g0_test')
    expect(fixture).toContain('ROLLBACK;')
    expect(fixture).toContain('pg_temp.expect_denied')
    expect(fixture).toContain('report_corrective_actions')
  })
})
