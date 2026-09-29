-- Repair only explicitly attested stale hotel-property scopes. An operator
-- records the canonical successor on the active property as
-- metadata.replacesPropertyId before this migration is run. Names, codes and
-- tenancy alone are deliberately never treated as evidence of replacement.
-- Missing, malformed or conflicting attestations leave the assignment intact.
WITH candidates AS (
  SELECT deleted.tenant_id, deleted.id AS old_id, (array_agg(active.id))[1] AS new_id
  FROM hospitality_properties deleted
  JOIN hospitality_properties active
    ON active.tenant_id = deleted.tenant_id
   AND active.deleted_at IS NULL
   AND active.metadata->>'replacesPropertyId' = deleted.id::text
  WHERE deleted.deleted_at IS NOT NULL
  GROUP BY deleted.tenant_id, deleted.id
  HAVING count(*) = 1
), updated AS (
  UPDATE role_assignments assignment
  SET scope = jsonb_set(
        assignment.scope,
        '{propertyIds}',
        (
          SELECT jsonb_agg(
            CASE WHEN item.value = candidate.old_id::text
              THEN to_jsonb(candidate.new_id::text)
              ELSE to_jsonb(item.value)
            END
            ORDER BY item.ordinality
          )
          FROM jsonb_array_elements_text(assignment.scope->'propertyIds')
            WITH ORDINALITY AS item(value, ordinality)
        ),
        true
      ),
      updated_at = now()
  FROM candidates candidate
  WHERE assignment.tenant_id = candidate.tenant_id
    AND assignment.scope->>'type' = 'properties'
    AND jsonb_typeof(assignment.scope->'propertyIds') = 'array'
    AND assignment.scope->'propertyIds' ? candidate.old_id::text
  RETURNING assignment.id, assignment.tenant_id, assignment.scope
)
INSERT INTO platform_audit_log (entity_type, entity_id, action, summary, after, metadata)
SELECT
  'role_assignment',
  id::text,
  'repair.property_scope',
  'Repaired a stale property access scope to its active replacement.',
  scope,
  '{"repair":"0053_property_scope_repair"}'::jsonb
FROM updated;

-- org_units participate in the certified property-reporting relationship. A
-- property-scoped principal can see only a site mapped to one of its active
-- hospitality properties, allowing incidents.site_org_unit_id -> org_units.id
-- -> org_units.name without exposing other tenant sites.
ALTER TABLE org_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_units FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON org_units;
CREATE POLICY tenant_isolation ON org_units
  USING (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND (
      current_setting('app.action_scope_mode', true) = 'tenant'
      OR (
        current_setting('app.action_scope_mode', true) = 'property'
        AND coalesce(nullif(current_setting('app.action_property_ids', true), ''), '[]')::jsonb
          ? (metadata->>'hospitalityPropertyId')::text
        AND EXISTS (
          SELECT 1 FROM hospitality_properties property_scope
          WHERE property_scope.tenant_id = org_units.tenant_id
            AND property_scope.id::text = org_units.metadata->>'hospitalityPropertyId'
            AND property_scope.deleted_at IS NULL
        )
      )
      OR (
        current_setting('app.action_scope_mode', true) = 'legacy'
        AND coalesce(metadata->>'hospitalityPropertyId', '') = ''
      )
    )
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND (
      current_setting('app.action_scope_mode', true) = 'tenant'
      OR (
        current_setting('app.action_scope_mode', true) = 'property'
        AND coalesce(nullif(current_setting('app.action_property_ids', true), ''), '[]')::jsonb
          ? (metadata->>'hospitalityPropertyId')::text
        AND EXISTS (
          SELECT 1 FROM hospitality_properties property_scope
          WHERE property_scope.tenant_id = org_units.tenant_id
            AND property_scope.id::text = org_units.metadata->>'hospitalityPropertyId'
            AND property_scope.deleted_at IS NULL
        )
      )
      OR (
        current_setting('app.action_scope_mode', true) = 'legacy'
        AND coalesce(metadata->>'hospitalityPropertyId', '') = ''
      )
    )
  );
