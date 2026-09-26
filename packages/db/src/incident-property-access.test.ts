import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  incidentChildPredicate,
  incidentInjuryTypeAssignmentPredicate,
  incidentPropertyPredicate,
} from './action-property-policy'
import { RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'

describe('Incident property access', () => {
  it('retains a rollback-only production-role integration proof', () => {
    const fixture = readFileSync(
      new URL('./incident-property-rls.integration.sql', import.meta.url),
      'utf8',
    )
    expect(fixture).toContain('SET LOCAL ROLE beaconhs_app')
    expect(fixture).toContain('app.action_property_ids')
    expect(fixture).toContain('pg_temp.expect_denied')
    expect(fixture).toContain('ROLLBACK;')
  })
  it('maps an Incident site to its hospitality property and preserves legacy sites', () => {
    const predicate = incidentPropertyPredicate()
    expect(predicate).toContain("site.metadata->>'hospitalityPropertyId'")
    expect(predicate).toContain('app.action_property_ids')
    expect(predicate).toContain('app.action_scope_mode')
  })

  it('inherits parent Incident scope across all property-sensitive child records', () => {
    const children = [
      'incident_injuries',
      'incident_lost_time_events',
      'incident_attachments',
      'incident_people',
      'incident_events',
      'incident_contributing_factors',
      'incident_root_cause_whys',
      'incident_preventative_steps',
    ]
    for (const table of children) {
      expect(TENANT_SCOPED_TABLES).toContain(table)
      expect(RLS_POLICY_SQL(table)).toContain(incidentChildPredicate(table))
    }
    expect(RLS_POLICY_SQL('incident_injury_type_assignments')).toContain(
      incidentInjuryTypeAssignmentPredicate(),
    )
  })

  it('installs property scope directly on Incident rows', () => {
    expect(RLS_POLICY_SQL('incidents')).toContain(incidentPropertyPredicate())
  })
})
