-- Forward-only production extension. Migrations 0000 through canonical 0062 are unchanged.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE approval_requests DROP CONSTRAINT approval_requests_source_module_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_source_module_check CHECK (source_module IN ('risk','maintenance','compliance','assets_ppm','people','tasks','financial'));
ALTER TABLE approval_requests DROP CONSTRAINT approval_requests_status_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_status_check CHECK (status IN ('pending','approved','rejected','more_info','cancelled'));

CREATE TABLE approval_financial_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
  amount numeric(16,2) NOT NULL CHECK (amount>0),
  currency text NOT NULL CHECK (currency IN ('GBP','EUR','USD')),
  supplier text NOT NULL CHECK (length(btrim(supplier)) BETWEEN 1 AND 300),
  description text NOT NULL CHECK (length(description)<=10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,property_id,id),
  FOREIGN KEY(tenant_id,property_id) REFERENCES hospitality_properties(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,requester_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE approval_workflow_rules (
  tenant_id uuid NOT NULL,
  property_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  category text NOT NULL CHECK(length(btrim(category)) BETWEEN 1 AND 100),
  currency text NOT NULL CHECK(currency IN ('GBP','EUR','USD')),
  maximum_amount numeric(16,2) NOT NULL CHECK(maximum_amount>0),
  reminder_hours integer NOT NULL CHECK(reminder_hours BETWEEN 1 AND 720),
  email_enabled boolean NOT NULL DEFAULT false,
  in_app_enabled boolean NOT NULL DEFAULT true,
  CHECK(email_enabled OR in_app_enabled),
  PRIMARY KEY(tenant_id,property_id,workflow_id),
  FOREIGN KEY(tenant_id,property_id,workflow_id) REFERENCES approval_workflows(tenant_id,property_id,id) ON DELETE RESTRICT
);

CREATE TABLE approval_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  property_id uuid NOT NULL,
  source_id uuid NOT NULL,
  uploader_id uuid NOT NULL,
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 200),
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png')),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,property_id,id),
  FOREIGN KEY(tenant_id,property_id,source_id) REFERENCES approval_financial_sources(tenant_id,property_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,uploader_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT,
  CHECK(object_key LIKE 't/' || tenant_id::text || '/approvals/%')
);

-- Immutable additional lifecycle evidence; the original decisions/stages remain immutable.
CREATE TABLE approval_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  property_id uuid NOT NULL,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  target_id uuid,
  position integer NOT NULL CHECK(position BETWEEN 1 AND 20),
  kind text NOT NULL CHECK(kind IN ('comment','cancel','more_info','resubmit','delegate','remind')),
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
  idempotency_key uuid NOT NULL,
  assignment_version integer NOT NULL CHECK(assignment_version>=0),
  audit_id uuid NOT NULL,
  audit_key text NOT NULL,
  audit_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id,property_id,request_id) REFERENCES approval_requests(tenant_id,property_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,actor_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,target_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,audit_key) REFERENCES audit_log(tenant_id,dedup_key) ON DELETE RESTRICT,
  CHECK((kind='delegate')=(target_id IS NOT NULL))
);
CREATE INDEX approval_activity_request_idx ON approval_activity(tenant_id,property_id,request_id,created_at,id);
CREATE UNIQUE INDEX approval_activity_delegation_version ON approval_activity(tenant_id,property_id,request_id,position,assignment_version) WHERE kind='delegate';

-- Effective assignment is derived from append-only delegation history, never stage edits.
CREATE FUNCTION approval_effective_assignee(t uuid,p uuid,r uuid,s integer) RETURNS uuid
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(
   (SELECT target_id FROM approval_activity WHERE tenant_id=t AND property_id=p AND request_id=r AND position=s AND kind='delegate' ORDER BY assignment_version DESC LIMIT 1),
   (SELECT approver_id FROM approval_stages WHERE tenant_id=t AND property_id=p AND request_id=r AND position=s))
$$;
CREATE FUNCTION approval_assignment_version(t uuid,p uuid,r uuid,s integer) RETURNS integer
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(max(assignment_version),0) FROM approval_activity WHERE tenant_id=t AND property_id=p AND request_id=r AND position=s AND kind='delegate'
$$;

DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='approval_decisions'::regclass AND contype='f' AND confrelid='approval_stages'::regclass LOOP
   EXECUTE format('ALTER TABLE approval_decisions DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE approval_decisions ADD CONSTRAINT approval_decisions_stage_fk FOREIGN KEY(tenant_id,property_id,request_id,position) REFERENCES approval_stages(tenant_id,property_id,request_id,position) ON DELETE RESTRICT;
ALTER TABLE approval_decisions ADD CONSTRAINT approval_decisions_actor_fk FOREIGN KEY(tenant_id,actor_id) REFERENCES tenant_users(tenant_id,id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION approval_decision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r approval_requests; a audit_log;
BEGIN
 SELECT * INTO r FROM approval_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR r.current_stage<>NEW.position OR r.requester_id=NEW.actor_id
   OR NEW.actor_id IS DISTINCT FROM approval_effective_assignee(NEW.tenant_id,NEW.property_id,NEW.request_id,NEW.position)
 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Decision is not eligible'; END IF;
 SELECT * INTO a FROM audit_log WHERE id=NEW.audit_id AND tenant_id=NEW.tenant_id AND dedup_key=NEW.audit_key;
 IF NOT FOUND OR a.entity_type<>'approval_request' OR a.entity_id<>NEW.request_id
   OR a.metadata->>'decisionId' IS DISTINCT FROM NEW.id::text
   OR a.metadata->>'decision' IS DISTINCT FROM NEW.decision
   OR a.metadata->>'reasonDigest' IS DISTINCT FROM encode(sha256(convert_to(NEW.reason,'UTF8')),'hex')
   OR NOT EXISTS(SELECT 1 FROM tenant_users u WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.actor_id AND u.user_id=a.actor_user_id AND u.status='active')
 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Approval audit mismatch'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION approval_request_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['status','current_stage']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','current_stage']) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Approval snapshot is immutable';
 END IF;
 IF OLD.status='pending' AND EXISTS(
  SELECT 1 FROM approval_decisions d WHERE d.tenant_id=OLD.tenant_id AND d.request_id=OLD.id AND d.position=OLD.current_stage
  AND ((d.decision='reject' AND NEW.status='rejected' AND NEW.current_stage=OLD.current_stage)
   OR (d.decision='approve' AND OLD.current_stage=OLD.stage_count AND NEW.status='approved' AND NEW.current_stage=OLD.current_stage)
   OR (d.decision='approve' AND OLD.current_stage<OLD.stage_count AND NEW.status='pending' AND NEW.current_stage=OLD.current_stage+1)))
 THEN RETURN NEW; END IF;
 IF OLD.current_stage=NEW.current_stage AND EXISTS(
  SELECT 1 FROM approval_activity a WHERE a.tenant_id=OLD.tenant_id AND a.property_id=OLD.property_id AND a.request_id=OLD.id
  AND a.position=OLD.current_stage AND a.id=(SELECT x.id FROM approval_activity x WHERE x.tenant_id=OLD.tenant_id AND x.request_id=OLD.id AND x.kind IN ('cancel','more_info','resubmit') ORDER BY x.created_at DESC,x.id DESC LIMIT 1)
  AND ((OLD.status IN ('pending','more_info') AND NEW.status='cancelled' AND a.kind='cancel')
   OR (OLD.status='pending' AND NEW.status='more_info' AND a.kind='more_info')
   OR (OLD.status='more_info' AND NEW.status='pending' AND a.kind='resubmit')))
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Invalid approval transition';
END $$;

CREATE FUNCTION approval_activity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r approval_requests; a audit_log; assignee uuid; v integer;
BEGIN
 SELECT * INTO r FROM approval_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.request_id FOR UPDATE;
 IF NOT FOUND OR r.current_stage<>NEW.position THEN RAISE EXCEPTION 'Approval stage unavailable'; END IF;
 assignee=approval_effective_assignee(NEW.tenant_id,NEW.property_id,NEW.request_id,NEW.position);
 v=approval_assignment_version(NEW.tenant_id,NEW.property_id,NEW.request_id,NEW.position);
 IF NEW.assignment_version<>v+(CASE WHEN NEW.kind='delegate' THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Stale approval assignment'; END IF;
 IF NEW.kind IN ('delegate','more_info') AND (r.status<>'pending' OR NEW.actor_id<>assignee OR NEW.actor_id=r.requester_id) THEN RAISE EXCEPTION 'Assigned approver required'; END IF;
 IF NEW.kind='delegate' AND (NEW.target_id IN (NEW.actor_id,r.requester_id) OR NOT EXISTS(SELECT 1 FROM tenant_users u WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.target_id AND u.status='active')) THEN RAISE EXCEPTION 'Invalid delegate'; END IF;
 IF NEW.kind='cancel' AND (r.status NOT IN ('pending','more_info') OR NEW.actor_id<>r.requester_id) THEN RAISE EXCEPTION 'Requester cancellation denied'; END IF;
 IF NEW.kind='resubmit' AND (r.status<>'more_info' OR NEW.actor_id<>r.requester_id) THEN RAISE EXCEPTION 'Requester response denied'; END IF;
 IF NEW.kind='remind' AND (r.status<>'pending' OR NEW.actor_id NOT IN(r.requester_id,assignee)) THEN RAISE EXCEPTION 'Reminder denied'; END IF;
 SELECT * INTO a FROM audit_log WHERE tenant_id=NEW.tenant_id AND id=NEW.audit_id AND dedup_key=NEW.audit_key;
 IF NOT FOUND OR a.entity_type<>'approval_request' OR a.entity_id<>NEW.request_id
  OR a.metadata->>'activityId' IS DISTINCT FROM NEW.id::text OR a.metadata->>'kind' IS DISTINCT FROM NEW.kind
  OR a.metadata->>'bodyDigest' IS DISTINCT FROM encode(sha256(convert_to(NEW.body,'UTF8')),'hex')
  OR NOT EXISTS(SELECT 1 FROM tenant_users u WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.actor_id AND u.user_id=a.actor_user_id AND u.status='active')
 THEN RAISE EXCEPTION 'Approval activity audit mismatch'; END IF;
 NEW.audit_snapshot=to_jsonb(a);
 RETURN NEW;
END $$;
CREATE TRIGGER approval_activity_guard BEFORE INSERT ON approval_activity FOR EACH ROW EXECUTE FUNCTION approval_activity_guard();
CREATE FUNCTION approval_activity_apply() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.kind IN ('cancel','more_info','resubmit') THEN
 UPDATE approval_requests SET status=CASE NEW.kind WHEN 'cancel' THEN 'cancelled' WHEN 'more_info' THEN 'more_info' ELSE 'pending' END
 WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.request_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_activity_apply AFTER INSERT ON approval_activity FOR EACH ROW EXECUTE FUNCTION approval_activity_apply();

CREATE FUNCTION approval_financial_submission_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.source_module='financial' AND NOT EXISTS(
 SELECT 1 FROM approval_financial_sources f JOIN approval_workflow_rules w ON w.tenant_id=f.tenant_id AND w.property_id=f.property_id AND w.workflow_id=NEW.workflow_id
 WHERE f.tenant_id=NEW.tenant_id AND f.property_id=NEW.property_id AND f.id=NEW.source_id AND f.requester_id=NEW.requester_id
 AND f.title=NEW.title AND NEW.source_version='1' AND f.category=w.category AND f.currency=w.currency AND f.amount<=w.maximum_amount
 AND EXISTS(SELECT 1 FROM approval_documents d WHERE d.tenant_id=f.tenant_id AND d.property_id=f.property_id AND d.source_id=f.id))
 THEN RAISE EXCEPTION 'Financial source, document or workflow limits invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_financial_submission_guard BEFORE INSERT ON approval_requests FOR EACH ROW EXECUTE FUNCTION approval_financial_submission_guard();
CREATE UNIQUE INDEX approval_financial_single_submission ON approval_requests(tenant_id,source_id) WHERE source_module='financial';

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['approval_financial_sources','approval_workflow_rules','approval_documents','approval_activity'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format($policy$CREATE POLICY tenant_isolation ON %1$I USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND
 EXISTS(SELECT 1 FROM hospitality_properties p WHERE p.tenant_id=%1$I.tenant_id AND p.id=%1$I.property_id AND p.deleted_at IS NULL) AND
 (current_setting('app.action_scope_mode',true)='tenant' OR
 (current_setting('app.action_scope_mode',true)='property' AND coalesce(nullif(current_setting('app.action_property_ids',true),''),'[]')::jsonb ? property_id::text)))$policy$,t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,beaconhs_app,beaconhs_super',t);
 EXECUTE format('GRANT SELECT,INSERT ON %I TO beaconhs_app,beaconhs_super',t);
 EXECUTE format('GRANT SELECT ON %I TO beaconhs_backup',t);
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION approval_immutable()',t||'_immutable',t);
 EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION approval_immutable()',t||'_no_truncate',t);
 END LOOP;
END $$;
