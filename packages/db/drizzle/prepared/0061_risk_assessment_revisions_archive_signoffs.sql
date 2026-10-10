-- PREPARED ONLY: outside the runnable migration chain; do not execute until separately approved.
-- Historical matrices/signoff revisions remain NULL when the original evidence is unknown.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

ALTER TABLE risk_assessments ADD COLUMN content_revision integer NOT NULL DEFAULT 1;
ALTER TABLE risk_assessments ADD CONSTRAINT risk_assessments_content_revision_ck
  CHECK (content_revision > 0);

CREATE TABLE risk_assessment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  assessment_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  actor_tenant_user_id uuid NULL,
  event text NOT NULL CHECK (event IN (
    'baseline','adopted','edited','hazard_archived','hazard_restored','matrix_changed','signed_off'
  )),
  reason text NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessment_versions_revision_ux UNIQUE (tenant_id, assessment_id, revision),
  CONSTRAINT risk_assessment_versions_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id) REFERENCES risk_assessments(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT risk_assessment_versions_actor_fk
    FOREIGN KEY (tenant_id, actor_tenant_user_id) REFERENCES tenant_users(tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT risk_assessment_versions_actor_event_ck CHECK (
    (event = 'baseline' AND actor_tenant_user_id IS NULL) OR
    (event <> 'baseline' AND actor_tenant_user_id IS NOT NULL)
  ),
  CONSTRAINT risk_assessment_versions_reason_ck CHECK (
    event NOT IN ('hazard_archived','hazard_restored','matrix_changed') OR
    (reason IS NOT NULL AND char_length(btrim(reason)) BETWEEN 1 AND 2000)
  ),
  CONSTRAINT risk_assessment_versions_snapshot_identity_ck CHECK (COALESCE((
    snapshot ?& ARRAY['schemaVersion','tenantId','assessmentId','contentRevision','assessment','hazards','provenance','matrix'] AND
    snapshot->>'schemaVersion' = '2' AND
    snapshot->>'tenantId' = tenant_id::text AND
    snapshot->>'assessmentId' = assessment_id::text AND
    (snapshot->>'contentRevision')::integer = revision AND
    jsonb_typeof(snapshot->'assessment') = 'object' AND
    jsonb_typeof(snapshot->'hazards') = 'array' AND
    jsonb_typeof(snapshot->'provenance') = 'object' AND
    ((event = 'baseline' AND snapshot->'matrix' = 'null'::jsonb) OR
      public.risk_matrix_snapshot_valid(snapshot->'matrix'))
  ),false))
);

-- A labelled baseline captures only values present at migration time. It does not
-- assert that the row was the content historically signed or that its matrix is known.
INSERT INTO risk_assessment_versions (
  tenant_id, assessment_id, revision, actor_tenant_user_id, event, reason, snapshot
)
SELECT ra.tenant_id, ra.id, ra.content_revision, NULL, 'baseline', NULL,
  jsonb_build_object(
    'schemaVersion', 2,
    'provenance', jsonb_build_object('kind','migration_baseline','capturedAt',transaction_timestamp()),
    'tenantId', ra.tenant_id,
    'assessmentId', ra.id,
    'contentRevision', ra.content_revision,
    'assessment', to_jsonb(ra),
    'matrix', ra.matrix_snapshot,
    'hazards', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.sort_order, h.id)
      FROM risk_hazards h WHERE h.tenant_id=ra.tenant_id AND h.assessment_id=ra.id
    ), '[]'::jsonb),
    'property', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'address', p.address)
      FROM hospitality_properties p WHERE p.tenant_id=ra.tenant_id AND p.id=ra.property_id),
    'tenant', (SELECT jsonb_build_object('id', t.id, 'name', t.name)
      FROM tenants t WHERE t.id=ra.tenant_id),
    'linkedActions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ca.id, 'sourceHazardId', ca.source_entity_id, 'title', ca.title,
        'status', ca.status, 'ownerTenantUserId', ca.owner_tenant_user_id, 'dueOn', ca.due_on
      ) ORDER BY ca.id)
      FROM corrective_actions ca
      JOIN risk_hazards h ON h.tenant_id=ca.tenant_id AND h.id=ca.source_entity_id
      WHERE ca.tenant_id=ra.tenant_id AND ca.source_entity_type='risk_hazard'
        AND h.assessment_id=ra.id
    ), '[]'::jsonb)
  )
FROM risk_assessments ra;

ALTER TABLE risk_hazards
  ADD COLUMN archived_at timestamptz NULL,
  ADD COLUMN archived_by_tenant_user_id uuid NULL,
  ADD COLUMN archive_reason text NULL;
ALTER TABLE risk_hazards ADD CONSTRAINT risk_hazards_archive_state_ck CHECK (
  (archived_at IS NULL AND archived_by_tenant_user_id IS NULL AND archive_reason IS NULL) OR
  (archived_at IS NOT NULL AND archived_by_tenant_user_id IS NOT NULL AND
   archive_reason IS NOT NULL AND char_length(btrim(archive_reason)) BETWEEN 1 AND 2000)
);
ALTER TABLE risk_hazards ADD CONSTRAINT risk_hazards_archive_actor_fk
  FOREIGN KEY (tenant_id, archived_by_tenant_user_id)
  REFERENCES tenant_users(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX risk_hazards_active_assessment_idx
  ON risk_hazards(tenant_id, assessment_id, sort_order) WHERE archived_at IS NULL;

ALTER TABLE risk_assessment_signoffs ADD COLUMN content_revision integer NULL;
ALTER TABLE risk_assessment_signoffs ALTER COLUMN template_version DROP NOT NULL;
ALTER TABLE risk_assessment_signoffs ADD CONSTRAINT risk_signoffs_content_revision_ck
  CHECK (content_revision IS NULL OR content_revision > 0);
ALTER TABLE risk_assessment_signoffs ADD CONSTRAINT risk_signoffs_revision_fk
  FOREIGN KEY (tenant_id, assessment_id, content_revision)
  REFERENCES risk_assessment_versions(tenant_id, assessment_id, revision)
  ON UPDATE RESTRICT ON DELETE RESTRICT;
-- Keep existing signoff content_revision NULL: historical linkage is not inferable.

CREATE OR REPLACE FUNCTION risk_reject_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Risk history is immutable';
END $$;
CREATE TRIGGER risk_assessment_versions_immutable_row
  BEFORE UPDATE OR DELETE ON risk_assessment_versions
  FOR EACH ROW EXECUTE FUNCTION risk_reject_immutable_change();
CREATE TRIGGER risk_assessment_versions_immutable_truncate
  BEFORE TRUNCATE ON risk_assessment_versions
  FOR EACH STATEMENT EXECUTE FUNCTION risk_reject_immutable_change();
CREATE TRIGGER risk_assessment_signoffs_immutable_row
  BEFORE UPDATE OR DELETE ON risk_assessment_signoffs
  FOR EACH ROW EXECUTE FUNCTION risk_reject_immutable_change();
CREATE TRIGGER risk_assessment_signoffs_immutable_truncate
  BEFORE TRUNCATE ON risk_assessment_signoffs
  FOR EACH STATEMENT EXECUTE FUNCTION risk_reject_immutable_change();

CREATE OR REPLACE FUNCTION risk_reject_hazard_identity_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.assessment_id IS DISTINCT FROM OLD.assessment_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Risk hazard identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_hazards_identity_guard
  BEFORE UPDATE ON risk_hazards FOR EACH ROW EXECUTE FUNCTION risk_reject_hazard_identity_change();
CREATE TRIGGER risk_hazards_no_delete
  BEFORE DELETE ON risk_hazards FOR EACH ROW EXECUTE FUNCTION risk_reject_immutable_change();
CREATE TRIGGER risk_hazards_no_truncate
  BEFORE TRUNCATE ON risk_hazards FOR EACH STATEMENT EXECUTE FUNCTION risk_reject_immutable_change();

ALTER TABLE risk_assessment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessment_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON risk_assessment_versions
  USING (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND
    EXISTS (
      SELECT 1 FROM risk_assessments parent
      WHERE parent.tenant_id = risk_assessment_versions.tenant_id
        AND parent.id = risk_assessment_versions.assessment_id
        AND (current_setting('app.action_scope_mode', true) = 'tenant' OR
          (current_setting('app.action_scope_mode', true) = 'property' AND
           coalesce(nullif(current_setting('app.action_property_ids', true), ''), '[]')::jsonb
             ? parent.property_id::text))
    )
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid AND
    EXISTS (
      SELECT 1 FROM risk_assessments parent
      WHERE parent.tenant_id = risk_assessment_versions.tenant_id
        AND parent.id = risk_assessment_versions.assessment_id
        AND (current_setting('app.action_scope_mode', true) = 'tenant' OR
          (current_setting('app.action_scope_mode', true) = 'property' AND
           coalesce(nullif(current_setting('app.action_property_ids', true), ''), '[]')::jsonb
             ? parent.property_id::text))
    )
  );
REVOKE UPDATE, DELETE, TRUNCATE ON risk_assessment_versions FROM beaconhs_app, beaconhs_super;
GRANT SELECT, INSERT ON risk_assessment_versions TO beaconhs_app, beaconhs_super;

-- One canonical capture shape is used by application writes and deferred guards.
-- Do not capture mutable tenant/property names into future snapshots implicitly:
-- capture their observations explicitly alongside the authoritative content.
CREATE FUNCTION public.risk_capture_content(target_tenant uuid, target_assessment uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'assessment', to_jsonb(ra),
    'matrix', ra.matrix_snapshot,
    'linkedActions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',ca.id,'sourceHazardId',ca.source_entity_id,'title',ca.title,
        'status',ca.status,'ownerTenantUserId',ca.owner_tenant_user_id,'dueOn',ca.due_on) ORDER BY ca.id)
      FROM public.corrective_actions ca JOIN public.risk_hazards h ON h.tenant_id=ca.tenant_id AND h.id=ca.source_entity_id
      WHERE ca.tenant_id=ra.tenant_id AND ca.source_entity_type='risk_hazard' AND h.assessment_id=ra.id
    ),'[]'::jsonb),
    'property', (SELECT jsonb_build_object('id',p.id,'name',p.name,'address',p.address) FROM public.hospitality_properties p WHERE p.id=ra.property_id AND p.tenant_id=ra.tenant_id),
    'tenant', (SELECT jsonb_build_object('id',t.id,'name',t.name) FROM public.tenants t WHERE t.id=ra.tenant_id),
    'hazards', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) - 'updated_at' ORDER BY h.sort_order,h.id)
      FROM public.risk_hazards h WHERE h.tenant_id=ra.tenant_id AND h.assessment_id=ra.id
    ), '[]'::jsonb)
  )
  FROM public.risk_assessments ra WHERE ra.tenant_id=target_tenant AND ra.id=target_assessment
$$;

CREATE FUNCTION public.risk_version_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.event = 'baseline' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Migration baselines cannot be added at runtime';
  END IF;
  NEW.transaction_id := txid_current();
  IF NEW.snapshot->'provenance'->>'kind' IS DISTINCT FROM 'application_revision' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Risk revision provenance is required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_version_insert_guard BEFORE INSERT ON risk_assessment_versions
  FOR EACH ROW EXECUTE FUNCTION public.risk_version_insert_guard();

CREATE FUNCTION public.risk_assessment_revision_step()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.property_id IS DISTINCT FROM OLD.property_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Risk assessment identity is immutable';
  END IF;
  IF ((to_jsonb(NEW) - ARRAY['updated_at','last_reminder_review_date','status']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['updated_at','last_reminder_review_date','status']) OR
     (NEW.status IS DISTINCT FROM OLD.status AND
      (NEW.status IN ('draft','retired') OR OLD.status IN ('draft','retired')))) AND
     NEW.content_revision <> OLD.content_revision + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Risk content must advance exactly one revision';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_assessment_revision_step BEFORE UPDATE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.risk_assessment_revision_step();

CREATE FUNCTION public.risk_revision_consistency_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE target_tenant uuid; target_assessment uuid; captured jsonb; stored jsonb; revision_no integer;
BEGIN
  IF TG_TABLE_NAME = 'risk_assessments' THEN
    IF TG_OP = 'UPDATE' AND NOT
       (NEW.status IS DISTINCT FROM OLD.status AND
        (NEW.status IN ('draft','retired') OR OLD.status IN ('draft','retired'))) AND
       (to_jsonb(NEW) - ARRAY['updated_at','last_reminder_review_date','status']) IS NOT DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['updated_at','last_reminder_review_date','status']) THEN RETURN NULL; END IF;
    target_tenant := NEW.tenant_id; target_assessment := NEW.id;
  ELSE
    target_tenant := NEW.tenant_id; target_assessment := NEW.assessment_id;
  END IF;
  SELECT content_revision INTO revision_no FROM public.risk_assessments
    WHERE tenant_id=target_tenant AND id=target_assessment;
  SELECT snapshot INTO stored FROM public.risk_assessment_versions
    WHERE tenant_id=target_tenant AND assessment_id=target_assessment AND revision=revision_no
      AND transaction_id=txid_current() AND event <> 'baseline';
  captured := public.risk_capture_content(target_tenant,target_assessment);
  IF stored IS NULL OR captured IS NULL OR
     (stored->'assessment' - ARRAY['updated_at','last_reminder_review_date','status']) IS DISTINCT FROM
       (captured->'assessment' - ARRAY['updated_at','last_reminder_review_date','status']) OR
     stored->'matrix' IS DISTINCT FROM captured->'matrix' OR
     stored->'hazards' IS DISTINCT FROM captured->'hazards' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Risk content and immutable revision must commit together';
  END IF;
  IF TG_TABLE_NAME = 'risk_assessment_versions' AND NEW.revision <> revision_no THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Risk revision must match current content';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER risk_assessment_revision_consistency AFTER INSERT OR UPDATE ON risk_assessments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.risk_revision_consistency_guard();
CREATE CONSTRAINT TRIGGER risk_hazard_revision_consistency AFTER INSERT OR UPDATE ON risk_hazards
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.risk_revision_consistency_guard();
CREATE CONSTRAINT TRIGGER risk_version_content_consistency AFTER INSERT ON risk_assessment_versions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.risk_revision_consistency_guard();

CREATE FUNCTION public.risk_signoff_revision_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE approved jsonb;
BEGIN
  SELECT snapshot INTO approved FROM public.risk_assessment_versions
    WHERE tenant_id=NEW.tenant_id AND assessment_id=NEW.assessment_id AND revision=NEW.content_revision
      AND event='signed_off' AND actor_tenant_user_id=NEW.signed_by_tenant_user_id;
  IF NEW.content_revision IS NULL OR approved IS NULL OR NEW.snapshot IS DISTINCT FROM approved->'report' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Sign-off must preserve the exact approved revision';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_signoff_revision_guard BEFORE INSERT ON risk_assessment_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.risk_signoff_revision_guard();
