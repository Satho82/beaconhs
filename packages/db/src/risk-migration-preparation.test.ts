import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROPERTY_REPORTING_TABLES, RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'

const migrationDir = resolve(import.meta.dirname, '../drizzle')
const readMigration = (name: string) =>
  readFileSync(resolve(migrationDir, 'prepared', name), 'utf8')

describe('prepared Risk Assessments migrations', () => {
  it('mirrors the tenant and property RLS boundaries for revisions and families', () => {
    expect(TENANT_SCOPED_TABLES).toContain('risk_assessment_versions')
    expect(TENANT_SCOPED_TABLES).toContain('risk_template_families')
    expect(PROPERTY_REPORTING_TABLES.has('risk_assessment_versions')).toBe(true)
    const revision = RLS_POLICY_SQL('risk_assessment_versions')
    expect(revision).toContain('FORCE ROW LEVEL SECURITY')
    expect(revision).toContain('app.tenant_id')
    // Child RLS delegates to the authoritative parent's own property policy.
    expect(RLS_POLICY_SQL('risk_assessments')).toContain('app.action_property_ids')
    expect(revision).toContain('property_parent.tenant_id=risk_assessment_versions.tenant_id')
    expect(revision).toContain('property_parent.id=risk_assessment_versions.assessment_id')
    expect(revision).toContain('risk_assessments')
    const families = RLS_POLICY_SQL('risk_template_families')
    expect(families).toContain('FOR SELECT')
    expect(families).toContain('tenant_id IS NULL OR')
    expect(families).toContain('FOR INSERT')
    expect(families).not.toContain('app.risk_manage')
  })

  it('prepares deferred content consistency and exact sign-off linkage without executing SQL', () => {
    const migration = readMigration('0061_risk_assessment_revisions_archive_signoffs.sql')
    expect(migration.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(3)
    expect(migration).toContain('NEW.content_revision <> OLD.content_revision + 1')
    expect(migration).toContain('transaction_id=txid_current()')
    expect(migration).toContain(
      "NEW.status IN ('draft','retired') OR OLD.status IN ('draft','retired')",
    )
    expect(migration).toContain("stored->'hazards' IS DISTINCT FROM captured->'hazards'")
    expect(migration).toContain("NEW.snapshot IS DISTINCT FROM approved->'report'")
    expect(migration).not.toContain('SECURITY DEFINER')
    expect(migration).toContain('COALESCE((')
  })
  it('keeps the enum addition isolated and leaves all three proposals unjournaled', () => {
    const state = readMigration('0059_risk_template_draft_state.sql')
    expect(state.match(/ALTER TYPE/gi)).toHaveLength(1)
    expect(state).toContain("ADD VALUE IF NOT EXISTS 'draft'")
    const journal = readFileSync(resolve(migrationDir, 'meta/_journal.json'), 'utf8')
    for (const name of [
      '0059_risk_template_draft_state',
      '0060_risk_template_families_manual_assessments',
      '0061_risk_assessment_revisions_archive_signoffs',
    ])
      expect(journal).not.toContain(name)
  })

  it('preserves unknown historical matrix evidence and separates manual provenance', () => {
    const migration = readMigration('0060_risk_template_families_manual_assessments.sql')
    expect(migration).toMatch(/ALTER TABLE risk_assessments ADD COLUMN matrix_snapshot jsonb NULL/i)
    expect(migration).not.toMatch(/UPDATE risk_assessments[\s\S]{0,300}matrix_snapshot\s*=/i)
    expect(migration).toContain("source_kind IN ('template','manual')")
    expect(migration).toContain('assessment_category risk_template_category')
    expect(migration).toContain('risk_template_families_owner_id_ux')
    expect(migration).toContain("value->>'modelKey' IS DISTINCT FROM")
  })

  it('keeps legacy sign-off revision links unknown and protects immutable history', () => {
    const migration = readMigration('0061_risk_assessment_revisions_archive_signoffs.sql')
    expect(migration).toMatch(/ADD COLUMN content_revision integer NULL/i)
    expect(migration).toContain('Keep existing signoff content_revision NULL')
    expect(migration).toContain('ON UPDATE RESTRICT ON DELETE RESTRICT')
    expect(migration).toContain('risk_assessment_versions_immutable_row')
    expect(migration).toContain('risk_assessment_versions_immutable_truncate')
    expect(migration).toContain('risk_hazards_identity_guard')
    expect(migration).toContain('risk_hazards_no_delete')
    expect(migration).toContain('risk_assessment_versions ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('risk_assessment_versions FORCE ROW LEVEL SECURITY')
  })
})
