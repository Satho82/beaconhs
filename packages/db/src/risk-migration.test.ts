import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'

const sql = readFileSync(
  resolve(import.meta.dirname, '../drizzle/0044_risk_assessment_foundation.sql'),
  'utf8',
)

describe('0044 Risk foundation migration', () => {
  it('adds only the intended Risk tables', () => {
    const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1])
    expect(tables).toEqual(['risk_templates', 'risk_assessments', 'risk_hazards'])
    expect(sql).not.toMatch(/CREATE TABLE "(?:hospitality_|maintenance_)/)
  })

  it('installs tenant RLS for every Risk table', () => {
    expect(TENANT_SCOPED_TABLES).toEqual(
      expect.arrayContaining(['risk_templates', 'risk_assessments', 'risk_hazards']),
    )
    expect(RLS_POLICY_SQL('risk_assessments')).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(RLS_POLICY_SQL('risk_templates')).toMatch(/tenant_id IS NULL/)
  })

  it('keeps property, creator, assessment, and template provenance constraints', () => {
    expect(sql).toMatch(/risk_assessments_tenant_property_fk/)
    expect(sql).toMatch(/risk_assessments_tenant_creator_fk/)
    expect(sql).toMatch(/risk_hazards_tenant_assessment_fk/)
    expect(sql).toMatch(/risk_assessments_template_fk/)
    expect(sql).toMatch(/risk_assessments_snapshot_version_check/)
  })

  it('constrains all likelihood and severity values to 1–5', () => {
    expect(sql.match(/BETWEEN 1 AND 5/g)).toHaveLength(4)
    expect(sql).toMatch(/initial_score" = "initial_likelihood" \* "initial_severity/)
    expect(sql).toMatch(/residual_score" = "residual_likelihood" \* "residual_severity/)
  })
})
