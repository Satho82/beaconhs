import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'

const sql = readFileSync(
  resolve(import.meta.dirname, '../drizzle/0045_risk_review_lifecycle.sql'),
  'utf8',
)

describe('0045 Risk review lifecycle migration', () => {
  it('adds lifecycle fields and constrained status values', () => {
    expect(sql).toMatch(/effective_date/)
    expect(sql).toMatch(/validity_months/)
    expect(sql).toMatch(/next_review_date/)
    expect(sql).toMatch(/reminder_lead_days/)
    expect(sql).toMatch(/lifecycle_version/)
    expect(sql).toMatch(/IN \(3,6,12,24\)/)
  })

  it('creates immutable tenant and property-bound sign-off history', () => {
    expect(sql).toMatch(/CREATE TABLE "risk_assessment_signoffs"/)
    expect(sql).toMatch(/risk_assessment_signoffs_tenant_assessment_fk/)
    expect(sql).toMatch(/risk_assessment_signoffs_tenant_property_fk/)
    expect(sql).toMatch(/risk_assessment_signoffs_tenant_signer_fk/)
  })

  it('installs the sign-off table in the central RLS registry', () => {
    expect(TENANT_SCOPED_TABLES).toContain('risk_assessment_signoffs')
    expect(RLS_POLICY_SQL('risk_assessment_signoffs')).toMatch(/FORCE ROW LEVEL SECURITY/)
  })

  it('contains no destructive lifecycle migration operations', () => {
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i)
  })
})
