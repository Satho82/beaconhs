import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PROPERTY_REPORTING_TABLES, RLS_POLICY_SQL } from './rls'

describe('property-scoped reporting database contracts', () => {
  it('certifies the reporting sources whose rows have property provenance', () => {
    for (const table of [
      'risk_assessments',
      'operational_task_occurrences',
      'people',
      'training_records',
      'form_responses',
      'ppe_items',
      'report_schedules',
    ]) {
      expect(PROPERTY_REPORTING_TABLES.has(table)).toBe(true)
      expect(RLS_POLICY_SQL(table)).not.toContain(
        "USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)\n",
      )
    }
    expect(PROPERTY_REPORTING_TABLES.has('incident_hours_periods')).toBe(false)
    expect(PROPERTY_REPORTING_TABLES.has('truck_log_entries')).toBe(false)
  })

  it('scopes assignments through their org unit without recursing through people', () => {
    const policy = RLS_POLICY_SQL('people_assignments')
    expect(policy).toContain('org_units site')
    expect(policy).not.toContain('FROM people property_parent')
  })

  it('does not recursively query hospitality properties from its own RLS policy', () => {
    const policy = RLS_POLICY_SQL('hospitality_properties')
    expect(policy).toContain('hospitality_properties.deleted_at IS NULL')
    expect(policy).not.toContain('FROM hospitality_properties property_scope')
  })

  it('persists and constrains the selected property on a schedule', () => {
    const migration = readFileSync(
      new URL('../drizzle/0050_report_property_context.sql', import.meta.url),
      'utf8',
    )
    expect(migration).toContain('property_context_id')
    expect(migration).toContain('hospitality_properties')
    expect(migration).toContain('FOREIGN KEY')
    expect(migration).toContain('CREATE INDEX')
  })

  it('fails closed for legacy report artifacts without an authorization stamp', () => {
    const policy = RLS_POLICY_SQL('report_runs')
    expect(policy).toContain("request_snapshot->'artifactAuthorization'")
    expect(policy).toContain("->>'version' = '1'")
    expect(policy).toContain("current_setting('app.action_property_ids', true)")
  })
})
