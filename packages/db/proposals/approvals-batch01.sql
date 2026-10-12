-- UNNUMBERED REVIEW PROPOSAL. Never run on DEV without explicit approval.
-- Additive only, grounded in the inspected DEV ledger through Risk 0061.
-- Execute as the existing migration owner in one transaction after preflight.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE approval_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  stages jsonb NOT NULL CHECK (jsonb_typeof(stages)='array' AND jsonb_array_length(stages) BETWEEN 1 AND 20),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,property_id,id),
  FOREIGN KEY (tenant_id,property_id) REFERENCES hospitality_properties(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  source_module text NOT NULL CHECK (source_module IN ('risk','maintenance','compliance','assets_ppm','people','tasks')),
  source_id uuid NOT NULL,
  source_version text NOT NULL CHECK (length(source_version) BETWEEN 1 AND 200),
  creation_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  current_stage integer NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 20),
  stage_count integer NOT NULL CHECK (stage_count BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,property_id,id),
  UNIQUE (tenant_id,creation_key),
  CHECK (current_stage <= stage_count),
  FOREIGN KEY (tenant_id,property_id,workflow_id) REFERENCES approval_workflows(tenant_id,property_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,requester_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX approval_requests_queue_idx ON approval_requests(tenant_id,property_id,status,created_at,id);
CREATE TABLE approval_stages (
  tenant_id uuid NOT NULL,
  property_id uuid NOT NULL,
  request_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 20),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  approver_id uuid NOT NULL,
  PRIMARY KEY (tenant_id,property_id,request_id,position),
  UNIQUE (tenant_id,property_id,request_id,position,approver_id),
  FOREIGN KEY (tenant_id,property_id,request_id) REFERENCES approval_requests(tenant_id,property_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,approver_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX approval_stages_assignee_idx ON approval_stages(tenant_id,approver_id,request_id);
CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  property_id uuid NOT NULL,
  request_id uuid NOT NULL,
  position integer NOT NULL,
  actor_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve','reject')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason)<=4000),
  idempotency_key uuid NOT NULL,
  audit_id uuid NOT NULL,
  audit_key text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'reject' OR length(btrim(reason))>0),
  UNIQUE (tenant_id,idempotency_key),
  UNIQUE (tenant_id,property_id,request_id,id),
  UNIQUE (tenant_id,property_id,request_id,position),
  FOREIGN KEY (tenant_id,audit_key) REFERENCES audit_log(tenant_id,dedup_key) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,property_id,request_id,position,actor_id)
    REFERENCES approval_stages(tenant_id,property_id,request_id,position,approver_id) ON DELETE RESTRICT
);
CREATE TABLE approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  property_id uuid NOT NULL,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('submitted','approve','reject')),
  decision_id uuid UNIQUE,
  audit_id uuid NOT NULL,
  audit_key text NOT NULL,
  evidence jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,property_id,request_id) REFERENCES approval_requests(tenant_id,property_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,property_id,request_id,decision_id) REFERENCES approval_decisions(tenant_id,property_id,request_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,audit_key) REFERENCES audit_log(tenant_id,dedup_key) ON DELETE RESTRICT,
  CHECK ((kind='submitted')=(decision_id IS NULL))
);
CREATE UNIQUE INDEX approval_events_submitted_ux ON approval_events(tenant_id,request_id) WHERE kind='submitted';

CREATE FUNCTION approval_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Approval evidence is immutable'; END $$;

CREATE FUNCTION approval_request_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF OLD.status <> 'pending' OR
    (to_jsonb(NEW)-ARRAY['status','current_stage']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','current_stage']) OR NOT EXISTS (
      SELECT 1 FROM approval_decisions d WHERE d.tenant_id=OLD.tenant_id
        AND d.request_id=OLD.id AND d.position=OLD.current_stage
        AND ((d.decision='reject' AND NEW.status='rejected' AND NEW.current_stage=OLD.current_stage)
          OR (d.decision='approve' AND OLD.current_stage=OLD.stage_count AND NEW.status='approved' AND NEW.current_stage=OLD.current_stage)
          OR (d.decision='approve' AND OLD.current_stage<OLD.stage_count AND NEW.status='pending' AND NEW.current_stage=OLD.current_stage+1)))
  THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid approval transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_request_transition BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION approval_request_transition();

CREATE FUNCTION approval_decision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r approval_requests; a audit_log;
BEGIN
  SELECT * INTO r FROM approval_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.request_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'pending' OR r.current_stage<>NEW.position OR r.requester_id=NEW.actor_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Decision is not eligible';
  END IF;
  SELECT * INTO a FROM audit_log WHERE id=NEW.audit_id AND tenant_id=NEW.tenant_id AND dedup_key=NEW.audit_key;
  IF NOT FOUND OR a.entity_type<>'approval_request' OR a.entity_id<>NEW.request_id
    OR a.metadata->>'decisionId' IS DISTINCT FROM NEW.id::text
    OR a.metadata->>'decision' IS DISTINCT FROM NEW.decision
    OR a.metadata->>'reasonDigest' IS DISTINCT FROM encode(sha256(convert_to(NEW.reason,'UTF8')),'hex')
    OR NOT EXISTS (SELECT 1 FROM tenant_users u WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.actor_id AND u.user_id=a.actor_user_id AND u.status='active')
  THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Approval audit mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_decision_guard BEFORE INSERT ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION approval_decision_guard();

CREATE FUNCTION approval_decision_apply() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r approval_requests;
BEGIN
  UPDATE approval_requests SET
    status=CASE WHEN NEW.decision='reject' THEN 'rejected' WHEN current_stage=stage_count THEN 'approved' ELSE 'pending' END,
    current_stage=CASE WHEN NEW.decision='approve' AND current_stage<stage_count THEN current_stage+1 ELSE current_stage END
    WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.request_id RETURNING * INTO r;
  INSERT INTO approval_events(tenant_id,property_id,request_id,actor_id,kind,decision_id,audit_id,audit_key,evidence)
    VALUES(NEW.tenant_id,NEW.property_id,NEW.request_id,NEW.actor_id,NEW.decision,NEW.id,NEW.audit_id,NEW.audit_key,
      jsonb_build_object('position',NEW.position,'decision',NEW.decision,'reason',NEW.reason,'status',r.status,'decidedAt',NEW.decided_at));
  RETURN NEW;
END $$;
CREATE TRIGGER approval_decision_apply AFTER INSERT ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION approval_decision_apply();

-- Canonical audit is the property-scoped immutable event, including a snapshot
-- of the existing shared audit entry. Shared audit behavior is not changed.
CREATE FUNCTION approval_event_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a audit_log; r approval_requests; d approval_decisions;
BEGIN
  SELECT * INTO a FROM audit_log WHERE id=NEW.audit_id AND tenant_id=NEW.tenant_id AND dedup_key=NEW.audit_key;
  IF NOT FOUND OR a.entity_type<>'approval_request' OR a.entity_id IS DISTINCT FROM NEW.request_id
    OR NOT EXISTS (SELECT 1 FROM tenant_users u WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.actor_id AND u.user_id=a.actor_user_id AND u.status='active')
  THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Approval event audit mismatch'; END IF;
  IF NEW.kind='submitted' THEN
    SELECT * INTO r FROM approval_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.request_id;
    IF NOT FOUND OR r.requester_id<>NEW.actor_id OR r.status<>'pending' OR r.current_stage<>1
      OR a.action<>'create' OR a.metadata->>'kind' IS DISTINCT FROM 'submitted'
    THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid submission event'; END IF;
  ELSE
    SELECT * INTO d FROM approval_decisions WHERE id=NEW.decision_id AND tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id;
    IF NOT FOUND OR d.actor_id<>NEW.actor_id OR d.audit_id<>NEW.audit_id OR d.decision<>NEW.kind
      OR NEW.evidence->>'reason' IS DISTINCT FROM d.reason
      OR NEW.evidence->>'position' IS DISTINCT FROM d.position::text
    THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid decision event'; END IF;
  END IF;
  NEW.evidence=NEW.evidence || jsonb_build_object('audit',to_jsonb(a));
  RETURN NEW;
END $$;
CREATE TRIGGER approval_event_guard BEFORE INSERT ON approval_events FOR EACH ROW EXECUTE FUNCTION approval_event_guard();

CREATE FUNCTION approval_submission_complete() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.status<>'pending' OR NEW.current_stage<>1
    OR (SELECT count(*) FROM approval_stages s WHERE s.tenant_id=NEW.tenant_id AND s.request_id=NEW.id
      AND s.position<=NEW.stage_count AND s.approver_id<>NEW.requester_id)<>NEW.stage_count
    OR NOT EXISTS (SELECT 1 FROM approval_events e WHERE e.tenant_id=NEW.tenant_id AND e.request_id=NEW.id AND e.kind='submitted')
  THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Incomplete approval submission'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER approval_submission_complete AFTER INSERT ON approval_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION approval_submission_complete();

CREATE FUNCTION approval_stage_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approval_requests r WHERE r.tenant_id=NEW.tenant_id AND r.property_id=NEW.property_id
    AND r.id=NEW.request_id AND r.status='pending' AND r.current_stage=1 AND NEW.position<=r.stage_count
    AND r.requester_id<>NEW.approver_id)
    OR EXISTS (SELECT 1 FROM approval_decisions d WHERE d.tenant_id=NEW.tenant_id AND d.request_id=NEW.request_id)
  THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid approval stage'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approval_stage_guard BEFORE INSERT ON approval_stages FOR EACH ROW EXECUTE FUNCTION approval_stage_guard();

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['approval_workflows','approval_requests','approval_stages','approval_decisions','approval_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format($policy$CREATE POLICY tenant_isolation ON %1$I USING (
      tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND
      EXISTS (SELECT 1 FROM hospitality_properties p WHERE p.tenant_id=%1$I.tenant_id AND p.id=%1$I.property_id AND p.deleted_at IS NULL) AND
      (current_setting('app.action_scope_mode',true)='tenant' OR
       (current_setting('app.action_scope_mode',true)='property' AND
        coalesce(nullif(current_setting('app.action_property_ids',true),''),'[]')::jsonb ? property_id::text)))$policy$,t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,beaconhs_app,beaconhs_super',t);
    EXECUTE format('GRANT SELECT,INSERT ON %I TO beaconhs_app,beaconhs_super',t);
    EXECUTE format('GRANT SELECT ON %I TO beaconhs_backup',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION approval_immutable()',t||'_no_delete',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION approval_immutable()',t||'_no_truncate',t);
    IF t <> 'approval_requests' THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION approval_immutable()',t||'_no_update',t);
    END IF;
  END LOOP;
END $$;
GRANT UPDATE(status,current_stage) ON approval_requests TO beaconhs_app,beaconhs_super;
