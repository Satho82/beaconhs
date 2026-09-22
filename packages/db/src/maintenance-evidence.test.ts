import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  maintenanceIssueAttachmentPredicate,
  maintenanceIssuePropertyPredicate,
} from './action-property-policy'
import { RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'

const fixture = readFileSync(
  new URL('./maintenance-evidence-rls.integration.sql', import.meta.url),
  'utf8',
)
const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')

const migration = readFileSync(
  new URL('../drizzle/0049_maintenance_issue_evidence.sql', import.meta.url),
  'utf8',
)

describe('maintenance issue evidence schema and RLS', () => {
  it('is sequential and retains rollback-only production-role isolation proof', () => {
    expect(journal).toContain('\"tag\": \"0049_maintenance_issue_evidence\"')
    expect(fixture).toContain('SET LOCAL ROLE beaconhs_app')
    expect(fixture).toContain('pg_temp.expect_denied')
    expect(fixture).toContain('ROLLBACK;')
  })

  it('installs composite tenant-safe relationships and constrained evidence stages', () => {
    expect(migration).toContain('maintenance_issue_attachments_issue_fk')
    expect(migration).toContain('maintenance_issue_attachments_attachment_fk')
    expect(migration).toContain('maintenance_issue_attachments_uploader_fk')
    expect(migration).toContain("'reported','before_work','after_work','completion'")
    expect(migration).toContain('maintenance_issue_attachments_attachment_ux')
  })

  it('property-scopes issues and inherits that scope for evidence', () => {
    expect(maintenanceIssuePropertyPredicate()).toContain('hospitality_buildings')
    expect(maintenanceIssuePropertyPredicate()).toContain('app.action_property_ids')
    expect(maintenanceIssueAttachmentPredicate()).toContain('maintenance_issues')
    expect(TENANT_SCOPED_TABLES).toContain('maintenance_issue_attachments')
    expect(RLS_POLICY_SQL('maintenance_issue_attachments')).toContain(
      maintenanceIssueAttachmentPredicate(),
    )
  })
})
