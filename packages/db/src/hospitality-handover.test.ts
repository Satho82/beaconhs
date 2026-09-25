import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  hospitalityHandoverChildPredicate,
  hospitalityHandoverPropertyPredicate,
} from './action-property-policy'
import { RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'

const migration = readFileSync(
  new URL('../drizzle/0047_hospitality_handover.sql', import.meta.url),
  'utf8',
)
const rlsFixture = readFileSync(
  new URL('./hospitality-handover-rls.integration.sql', import.meta.url),
  'utf8',
)

describe('Hotel Handover database foundation', () => {
  it('is the next forward migration with required integrity constraints', () => {
    expect(migration).toContain('CREATE TABLE "hospitality_handovers"')
    expect(migration).toContain('"handover_property_fk"')
    expect(migration).toContain('"handover_author_fk"')
    expect(migration).toContain('"handover_room_fk"')
    expect(migration).toContain('"handover_maintenance_fk"')
    expect(migration).toContain('"handover_action_fk"')
    expect(migration).toContain('"handover_carried_from_fk"')
    expect(migration).toContain('"handover_attachment_ux"')
  })

  it('adds every tenant-owned Handover table to RLS', () => {
    for (const table of [
      'hospitality_handovers',
      'hospitality_handover_comments',
      'hospitality_handover_acknowledgements',
      'hospitality_handover_attachments',
    ]) {
      expect(TENANT_SCOPED_TABLES).toContain(table)
      expect(RLS_POLICY_SQL(table)).toContain('FORCE ROW LEVEL SECURITY')
    }
  })

  it('scopes parents by authorised property and children through the visible parent', () => {
    expect(hospitalityHandoverPropertyPredicate()).toContain('hospitality_handovers.property_id')
    expect(hospitalityHandoverPropertyPredicate()).toContain('app.action_property_ids')
    expect(hospitalityHandoverChildPredicate('hospitality_handover_comments')).toContain(
      'SELECT 1 FROM hospitality_handovers',
    )
    expect(RLS_POLICY_SQL('hospitality_handover_comments')).toContain(
      'h.id=hospitality_handover_comments.handover_id',
    )
  })

  it('retains rollback-only property and tenant isolation proofs for deployment CI', () => {
    expect(rlsFixture).toContain('SET LOCAL ROLE uvanoo_handover_test')
    expect(rlsFixture).toContain("set_config('app.action_scope_mode','property'")
    expect(rlsFixture).toContain("set_config('app.action_property_ids','[]'")
    expect(rlsFixture).toContain('pg_temp.expect_denied')
    expect(rlsFixture).toContain('hospitality_handover_comments')
    expect(rlsFixture).toContain('ROLLBACK;')
  })

  it('maps Handover-created Actions back to authoritative property provenance', () => {
    expect(RLS_POLICY_SQL('corrective_actions')).toContain(
      "source_entity_type = 'hospitality_handover'",
    )
    expect(RLS_POLICY_SQL('corrective_actions')).toContain('FROM hospitality_handovers h')
  })
})
