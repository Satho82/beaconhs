-- Run ONLY in a disposable database after the complete migration history,
-- RLS_POLICY_SQL installer, and REPORT_VIEWS_SQL installer. All fixtures roll back.
BEGIN;
CREATE ROLE uvanoo_g0_test NOLOGIN;
GRANT USAGE ON SCHEMA public TO uvanoo_g0_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uvanoo_g0_test;
INSERT INTO tenants (id,slug,name) VALUES
('10000000-0000-4000-8000-000000000001','g0-a','G0 A'),
('10000000-0000-4000-8000-000000000002','g0-b','G0 B');
INSERT INTO "user" (id,email,name) VALUES ('g0-f','g0-f@example.invalid','F Manager'),('g0-l','g0-l@example.invalid','L Manager');
INSERT INTO tenant_users (id,tenant_id,user_id) VALUES
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','g0-f'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','g0-l');
INSERT INTO roles (id,tenant_id,key,name,permissions) VALUES
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','g0-manager','Manager','["ca.read.all","ca.update"]');
INSERT INTO role_assignments (tenant_id,tenant_user_id,role_id,scope) VALUES
('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','{"type":"properties","propertyIds":["20000000-0000-4000-8000-000000000001"]}'),
('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','{"type":"properties","propertyIds":["20000000-0000-4000-8000-000000000002"]}');
INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fenchurch','F','Europe/London'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Lincoln','L','Europe/London'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Other tenant','O','Europe/London');
INSERT INTO risk_templates (id,owner_key,scope,title,category,description,version) VALUES
('50000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','platform','G0 risk','general','Fixture','1.0');
INSERT INTO risk_assessments (id,tenant_id,property_id,template_owner_key,template_id,adopted_template_version,adopted_template_snapshot,reference,title,creator_tenant_user_id,assessor_tenant_user_id,assessment_date) VALUES
('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','50000000-0000-4000-8000-000000000001','1.0','{"version":"1.0"}','G0-RA','Lincoln risk','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',current_date);
INSERT INTO risk_hazards (id,tenant_id,assessment_id,hazard_description,harm_description,initial_likelihood,initial_severity,initial_score,controls,residual_likelihood,residual_severity,residual_score) VALUES
('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','Slip','Fall',5,5,25,'Dry floor',1,2,2);
INSERT INTO corrective_actions (id,tenant_id,reference,title,metadata,source_entity_type,source_entity_id) VALUES
('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','G0-F','Fenchurch action','{"propertyId":"20000000-0000-4000-8000-000000000001"}',NULL,NULL),
('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','G0-L','Lincoln action','{"propertyId":"20000000-0000-4000-8000-000000000002"}',NULL,NULL),
('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','G0-U','Unresolved','{}',NULL,NULL),
('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','G0-B','Other tenant','{"propertyId":"20000000-0000-4000-8000-000000000003"}',NULL,NULL),
('60000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','G0-R','Risk-linked Lincoln','{}','risk_hazard','50000000-0000-4000-8000-000000000003'),
('60000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','G0-S','Spoofed property','{"propertyId":"20000000-0000-4000-8000-000000000001"}','risk_hazard','50000000-0000-4000-8000-000000000003'),
('60000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','G0-X','Unknown source','{"propertyId":"20000000-0000-4000-8000-000000000001"}','unknown','50000000-0000-4000-8000-000000000003');
INSERT INTO attachments (id,tenant_id,kind,r2_key,content_type,size_bytes,filename) VALUES
('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','image','t/10000000-0000-4000-8000-000000000001/g0/f.png','image/png',1,'f.png'),
('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','image','t/10000000-0000-4000-8000-000000000001/g0/l.png','image/png',1,'l.png');
INSERT INTO ca_photos (tenant_id,ca_id,attachment_id) VALUES
('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002');
INSERT INTO ca_complete_steps (tenant_id,ca_id,kind) VALUES
('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','action_taken'),
('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','action_taken');
INSERT INTO audit_log (tenant_id,entity_type,entity_id,action) VALUES
('10000000-0000-4000-8000-000000000001','corrective_action','60000000-0000-4000-8000-000000000001','create'),
('10000000-0000-4000-8000-000000000001','corrective_action','60000000-0000-4000-8000-000000000002','create');

CREATE TEMP TABLE report_scope_cases (pdf_attachment_id uuid, row_count integer, request_snapshot jsonb);
GRANT SELECT ON report_scope_cases TO uvanoo_g0_test;
INSERT INTO report_scope_cases VALUES
('70000000-0000-4000-8000-000000000001',1,'{"artifactAuthorization":{"version":1,"mode":"property","propertyIds":["20000000-0000-4000-8000-000000000001"]}}'),
('70000000-0000-4000-8000-000000000001',1,'{"artifactAuthorization":{"version":1,"mode":"property","propertyIds":["20000000-0000-4000-8000-000000000002"]}}'),
('70000000-0000-4000-8000-000000000001',1,'{"artifactAuthorization":{"version":1,"mode":"property","propertyIds":["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"]}}'),
('70000000-0000-4000-8000-000000000001',1,'{"artifactAuthorization":{"version":1,"mode":"legacy","propertyIds":[]}}'),
('70000000-0000-4000-8000-000000000001',1,'{}'),
(NULL,NULL,'{}');

CREATE FUNCTION pg_temp.expect_count(query text, expected bigint) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE actual bigint; BEGIN
  EXECUTE query INTO actual;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %: %',expected,actual,query; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_denied(query text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN EXECUTE query;
  EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
  RAISE EXCEPTION 'Unexpectedly accepted: %',query;
END $$;
SET LOCAL ROLE uvanoo_g0_test;
SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["20000000-0000-4000-8000-000000000001"]',true);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM report_scope_cases report_runs WHERE /* REPORT_ARTIFACT_SCOPE */ true$query$,2);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions WHERE id=''60000000-0000-4000-8000-000000000002''',0);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions WHERE title ILIKE ''%Lincoln%''',0);
SELECT pg_temp.expect_count('SELECT count(*) FROM report_corrective_actions',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM ca_photos',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM ca_complete_steps',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM audit_log WHERE entity_type=''corrective_action''',1);
INSERT INTO audit_log (tenant_id,entity_type,action,summary,metadata) VALUES
('10000000-0000-4000-8000-000000000001','corrective_action','export','Exported 1 Fenchurch action','{"actionAuthorization":{"version":1,"mode":"property","propertyIds":["20000000-0000-4000-8000-000000000001"]}}');
SELECT pg_temp.expect_count('SELECT count(*) FROM audit_log WHERE entity_id IS NULL',1);
SELECT pg_temp.expect_denied('INSERT INTO audit_log (tenant_id,entity_type,action) VALUES (''10000000-0000-4000-8000-000000000001'',''corrective_action'',''export'')');
SELECT pg_temp.expect_count('WITH changed AS (UPDATE corrective_actions SET status=''closed'',locked=true WHERE id=''60000000-0000-4000-8000-000000000002'' RETURNING id) SELECT count(*) FROM changed',0);
SELECT pg_temp.expect_count('WITH changed AS (DELETE FROM ca_photos WHERE ca_id=''60000000-0000-4000-8000-000000000002'' RETURNING id) SELECT count(*) FROM changed',0);
SELECT pg_temp.expect_denied('UPDATE corrective_actions SET owner_tenant_user_id=''30000000-0000-4000-8000-000000000002'' WHERE id=''60000000-0000-4000-8000-000000000001''');
SELECT pg_temp.expect_count('WITH changed AS (UPDATE corrective_actions SET owner_tenant_user_id=''30000000-0000-4000-8000-000000000001'' WHERE id=''60000000-0000-4000-8000-000000000001'' RETURNING id) SELECT count(*) FROM changed',1);
SELECT pg_temp.expect_denied('UPDATE corrective_actions SET metadata=''{"propertyId":"20000000-0000-4000-8000-000000000002"}'' WHERE id=''60000000-0000-4000-8000-000000000001''');
SELECT pg_temp.expect_denied('INSERT INTO corrective_actions (tenant_id,reference,title,metadata) VALUES (''10000000-0000-4000-8000-000000000001'',''G0-BAD'',''Bad'',''{"propertyId":"20000000-0000-4000-8000-000000000002"}'')');
SELECT pg_temp.expect_denied('INSERT INTO ca_complete_steps (tenant_id,ca_id,kind) VALUES (''10000000-0000-4000-8000-000000000001'',''60000000-0000-4000-8000-000000000002'',''action_taken'')');
SELECT set_config('app.action_property_ids','["20000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM audit_log WHERE entity_id IS NULL',0);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM report_scope_cases report_runs WHERE /* REPORT_ARTIFACT_SCOPE */ true$query$,2);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',2);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions WHERE reference=''G0-F''',0);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions WHERE reference=''G0-R''',1);
SELECT set_config('app.action_property_ids','["20000000-0000-4000-8000-000000000001","20000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM report_scope_cases report_runs WHERE /* REPORT_ARTIFACT_SCOPE */ true$query$,4);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',3);
SELECT pg_temp.expect_count('SELECT count(*) FROM report_corrective_actions',3);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions WHERE tenant_id=''10000000-0000-4000-8000-000000000002''',0);
SELECT set_config('app.action_property_ids','[]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',0);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM report_scope_cases report_runs WHERE /* REPORT_ARTIFACT_SCOPE */ true$query$,1);
SELECT set_config('app.action_scope_mode','legacy',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',1);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM report_scope_cases report_runs WHERE /* REPORT_ARTIFACT_SCOPE */ true$query$,2);
SELECT set_config('app.action_scope_mode','',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',0);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM report_scope_cases report_runs WHERE /* REPORT_ARTIFACT_SCOPE */ true$query$,6);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',6);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions WHERE tenant_id=''10000000-0000-4000-8000-000000000002''',0);
SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000002',true);
-- A non-property source cannot override a hotel's Action location.
SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000001',true);
INSERT INTO org_units (id,tenant_id,level,name,metadata) VALUES
('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','site','F site','{"hospitalityPropertyId":"20000000-0000-4000-8000-000000000001"}');
INSERT INTO incidents (id,tenant_id,reference,type,severity,title,occurred_at) VALUES
('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','G0-INC','other','no_injury','Non-property source',now());
INSERT INTO corrective_actions (tenant_id,reference,title,site_org_unit_id,source_entity_type,source_entity_id) VALUES
('10000000-0000-4000-8000-000000000001','G0-CONFLICT','Conflicting location','80000000-0000-4000-8000-000000000001','incident','90000000-0000-4000-8000-000000000001');
SELECT set_config('app.action_scope_mode','legacy',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions WHERE reference=''G0-CONFLICT''',0);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',1);
RESET ROLE;
ROLLBACK;
SELECT 'Action property RLS integration: PASS' AS result;
