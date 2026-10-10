-- PREPARED ONLY: outside the runnable migration chain; do not execute until separately approved.
-- Existing templates remain distinct families, platform templates remain read-only,
-- and assessment matrix evidence remains NULL unless captured at creation.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

-- CHECK expressions must return false, not NULL, for incomplete JSON.
CREATE FUNCTION public.risk_matrix_snapshot_valid(value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE n integer; s integer; l integer; cell jsonb; label text; color text;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) <> 'object' OR
     NOT value ?& ARRAY['schemaVersion','modelKey','size','axes','cells'] OR
     (SELECT count(*) FROM jsonb_object_keys(value)) <> 5 OR
     value->'schemaVersion' <> '1'::jsonb OR value->'size' NOT IN ('3'::jsonb,'5'::jsonb) THEN
    RETURN false;
  END IF;
  n := (value->>'size')::integer;
  IF value->>'modelKey' IS DISTINCT FROM ('uvanoo-' || n || 'x' || n || '-v1') OR
     jsonb_typeof(value->'axes') <> 'object' OR
     NOT (value->'axes') ?& ARRAY['severity','likelihood'] OR
     (SELECT count(*) FROM jsonb_object_keys(value->'axes')) <> 2 OR
     jsonb_typeof(value->'cells') <> 'object' OR
     (SELECT count(*) FROM jsonb_object_keys(value->'cells')) <> n*n THEN RETURN false; END IF;
  FOREACH label IN ARRAY ARRAY['severity','likelihood'] LOOP
    IF jsonb_typeof(value->'axes'->label) <> 'object' OR
       NOT (value->'axes'->label) ? 'values' OR
       (SELECT count(*) FROM jsonb_object_keys(value->'axes'->label)) <> 1 OR
       jsonb_typeof(value->'axes'->label->'values') <> 'array' OR
       jsonb_array_length(value->'axes'->label->'values') <> n THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(value->'axes'->label->'values') item
      WHERE jsonb_typeof(item) <> 'string' OR char_length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 100)
      THEN RETURN false; END IF;
  END LOOP;
  FOR s IN 1..n LOOP
    FOR l IN 1..n LOOP
      cell := value->'cells'->((s-1)::text || ':' || (l-1)::text);
      IF cell IS NULL OR jsonb_typeof(cell) <> 'object' OR
         NOT cell ?& ARRAY['score','label','color'] OR
         (SELECT count(*) FROM jsonb_object_keys(cell)) <> 3 OR
         cell->'score' <> to_jsonb(s*l) THEN RETURN false; END IF;
      label := cell->>'label';
      color := CASE label WHEN 'Low' THEN '#10b981' WHEN 'Medium' THEN '#f59e0b'
        WHEN 'High' THEN '#f97316' WHEN 'Critical' THEN '#dc2626' END;
      IF color IS NULL OR cell->>'color' IS DISTINCT FROM color THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE TABLE risk_template_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_key uuid NOT NULL,
  scope risk_template_scope NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_template_families_owner_id_ux UNIQUE (owner_key, id),
  CONSTRAINT risk_template_families_scope_tenant_ck CHECK (
    (scope = 'platform' AND tenant_id IS NULL AND owner_key = '00000000-0000-0000-0000-000000000000') OR
    (scope = 'tenant' AND tenant_id IS NOT NULL AND owner_key = tenant_id)
  )
);

-- One initial family per existing template preserves all IDs and provenance.
INSERT INTO risk_template_families (id, tenant_id, owner_key, scope)
SELECT id, tenant_id, owner_key, scope FROM risk_templates;

ALTER TABLE risk_templates ADD COLUMN template_family_id uuid;
UPDATE risk_templates SET template_family_id = id;
ALTER TABLE risk_templates ALTER COLUMN template_family_id SET NOT NULL;
ALTER TABLE risk_templates
  ADD CONSTRAINT risk_templates_family_fk
  FOREIGN KEY (owner_key, template_family_id)
  REFERENCES risk_template_families(owner_key, id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE UNIQUE INDEX risk_templates_owner_family_version_ux
  ON risk_templates(owner_key, template_family_id, version);
CREATE UNIQUE INDEX risk_templates_one_active_family_ux
  ON risk_templates(owner_key, template_family_id) WHERE state = 'active';
CREATE UNIQUE INDEX risk_templates_one_draft_family_ux
  ON risk_templates(owner_key, template_family_id) WHERE state = 'draft';

CREATE OR REPLACE FUNCTION risk_template_family_owner_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE family_tenant uuid; family_owner uuid; family_scope public.risk_template_scope;
BEGIN
  SELECT tenant_id, owner_key, scope INTO family_tenant, family_owner, family_scope
  FROM public.risk_template_families WHERE id = NEW.template_family_id;
  IF NOT FOUND OR family_tenant IS DISTINCT FROM NEW.tenant_id OR
     family_owner IS DISTINCT FROM NEW.owner_key OR family_scope IS DISTINCT FROM NEW.scope THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Risk template family ownership mismatch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_templates_family_owner_guard
  BEFORE INSERT OR UPDATE OF tenant_id, owner_key, scope, template_family_id ON risk_templates
  FOR EACH ROW EXECUTE FUNCTION risk_template_family_owner_guard();

-- Template matrices use the established canonical 5x5 scoring bands. This data
-- is a template default only; it is not claimed as a historical assessment matrix.
ALTER TABLE risk_templates ADD COLUMN matrix_snapshot jsonb;
WITH axis AS (
  SELECT '["Negligible","Minor","Moderate","Major","Severe"]'::jsonb AS severity,
         '["Rare","Unlikely","Possible","Likely","Almost certain"]'::jsonb AS likelihood
), cells AS (
  SELECT jsonb_object_agg(
    (s - 1)::text || ':' || (l - 1)::text,
    jsonb_build_object(
      'score', s * l,
      'label', CASE WHEN s*l <= 4 THEN 'Low' WHEN s*l <= 9 THEN 'Medium'
                    WHEN s*l <= 16 THEN 'High' ELSE 'Critical' END,
      'color', CASE WHEN s*l <= 4 THEN '#10b981' WHEN s*l <= 9 THEN '#f59e0b'
                    WHEN s*l <= 16 THEN '#f97316' ELSE '#dc2626' END
    )
  ) AS value FROM generate_series(1,5) s CROSS JOIN generate_series(1,5) l
)
UPDATE risk_templates t SET matrix_snapshot = jsonb_build_object(
  'schemaVersion', 1, 'modelKey', 'uvanoo-5x5-v1', 'size', 5,
  'axes', jsonb_build_object('severity', jsonb_build_object('values', axis.severity),
                             'likelihood', jsonb_build_object('values', axis.likelihood)),
  'cells', cells.value
) FROM axis, cells;
ALTER TABLE risk_templates ALTER COLUMN matrix_snapshot SET NOT NULL;
ALTER TABLE risk_templates ADD CONSTRAINT risk_templates_matrix_valid_ck
  CHECK (public.risk_matrix_snapshot_valid(matrix_snapshot));
ALTER TABLE risk_templates ADD CONSTRAINT risk_templates_matrix_snapshot_shape_ck CHECK (
  jsonb_typeof(matrix_snapshot) = 'object' AND matrix_snapshot->>'schemaVersion' = '1' AND
  matrix_snapshot->>'modelKey' IN ('uvanoo-5x5-v1', 'uvanoo-3x3-v1') AND
  (matrix_snapshot->>'size')::integer IN (3,5) AND
  jsonb_typeof(matrix_snapshot->'axes'->'severity'->'values') = 'array' AND
  jsonb_typeof(matrix_snapshot->'axes'->'likelihood'->'values') = 'array' AND
  jsonb_typeof(matrix_snapshot->'cells') = 'object' AND
  matrix_snapshot ?& ARRAY['schemaVersion','modelKey','size','axes','cells']
);

ALTER TABLE risk_assessments
  ALTER COLUMN template_owner_key DROP NOT NULL,
  ALTER COLUMN template_id DROP NOT NULL,
  ALTER COLUMN adopted_template_version DROP NOT NULL,
  ALTER COLUMN adopted_template_snapshot DROP NOT NULL;
ALTER TABLE risk_assessments ADD COLUMN source_kind text NOT NULL DEFAULT 'template';
ALTER TABLE risk_assessments ADD COLUMN assessment_category risk_template_category;
UPDATE risk_assessments
SET assessment_category = (adopted_template_snapshot->>'category')::risk_template_category;
ALTER TABLE risk_assessments ALTER COLUMN assessment_category SET NOT NULL;
ALTER TABLE risk_assessments ADD COLUMN matrix_snapshot jsonb NULL;
ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_matrix_valid_ck
  CHECK (matrix_snapshot IS NULL OR public.risk_matrix_snapshot_valid(matrix_snapshot));
ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_source_kind_ck CHECK (
  source_kind IN ('template','manual') AND
  ((source_kind = 'template' AND template_owner_key IS NOT NULL AND template_id IS NOT NULL AND
    adopted_template_version IS NOT NULL AND adopted_template_snapshot IS NOT NULL) OR
   (source_kind = 'manual' AND template_owner_key IS NULL AND template_id IS NULL AND
    adopted_template_version IS NULL AND adopted_template_snapshot IS NULL))
);
ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_matrix_snapshot_shape_ck CHECK (
  matrix_snapshot IS NULL OR (jsonb_typeof(matrix_snapshot) = 'object' AND
    matrix_snapshot->>'schemaVersion' = '1' AND
    matrix_snapshot->>'modelKey' IN ('uvanoo-5x5-v1','uvanoo-3x3-v1') AND
    (matrix_snapshot->>'size')::integer IN (3,5) AND
    jsonb_typeof(matrix_snapshot->'cells') = 'object' AND
    matrix_snapshot ?& ARRAY['schemaVersion','modelKey','size','axes','cells'])
);

CREATE OR REPLACE FUNCTION risk_require_assessment_matrix_on_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.matrix_snapshot IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'New risk assessments require a matrix snapshot';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_assessments_matrix_on_insert
  BEFORE INSERT ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION risk_require_assessment_matrix_on_insert();

ALTER TABLE risk_template_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_template_families FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON risk_template_families TO beaconhs_app, beaconhs_super;
REVOKE TRUNCATE ON risk_template_families FROM beaconhs_app, beaconhs_super;
CREATE POLICY tenant_isolation ON risk_template_families FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_write_insert ON risk_template_families FOR INSERT
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_write_update ON risk_template_families FOR UPDATE
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_write_delete ON risk_template_families FOR DELETE
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE FUNCTION public.risk_template_content_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Risk templates must be retired, not deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_key IS DISTINCT FROM OLD.owner_key OR
     NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.scope IS DISTINCT FROM OLD.scope OR
     NEW.template_family_id IS DISTINCT FROM OLD.template_family_id OR NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Risk template version identity is immutable';
  END IF;
  IF OLD.state <> 'draft' AND
     ((to_jsonb(NEW) - ARRAY['state','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['state','updated_at']) OR
      NOT (NEW.state = OLD.state OR (OLD.state = 'active' AND NEW.state = 'retired'))) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Published risk template content is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_templates_content_guard BEFORE UPDATE OR DELETE ON risk_templates
  FOR EACH ROW EXECUTE FUNCTION public.risk_template_content_guard();
