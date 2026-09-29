import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../drizzle/0053_property_scope_repair.sql', import.meta.url),
  'utf8',
)

describe('0053 property-scope repair migration contract', () => {
  it('uses only an explicit canonical replacement attestation', () => {
    expect(migration).toContain("active.metadata->>'replacesPropertyId' = deleted.id::text")
    expect(migration).toContain('HAVING count(*) = 1')
    expect(migration).not.toContain('active.name = deleted.name')
    expect(migration).not.toContain('active.code = deleted.code')
  })

  it('preserves unrelated scopes and fails closed for malformed, absent or ambiguous mappings', () => {
    expect(migration).toContain("jsonb_typeof(assignment.scope->'propertyIds') = 'array'")
    expect(migration).toContain("assignment.scope->'propertyIds' ? candidate.old_id::text")
    expect(migration).toContain('ELSE to_jsonb(item.value)')
    expect(migration).toContain('ORDER BY item.ordinality')
    expect(migration).toContain("'repair.property_scope'")
  })

  it('does not rewrite historical operational rows and is idempotent after replacement', () => {
    expect(migration).not.toContain('UPDATE incidents')
    expect(migration).not.toContain('UPDATE audit_log')
    expect(migration).toContain('CASE WHEN item.value = candidate.old_id::text')
  })

  it('certifies the incident site relation through property-safe org-unit RLS', () => {
    expect(migration).toContain('ALTER TABLE org_units ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain("? (metadata->>'hospitalityPropertyId')::text")
    expect(migration).toContain('property_scope.deleted_at IS NULL')
  })
})
