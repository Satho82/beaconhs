-- Run only in a disposable database after migrations and RLS installation.
BEGIN;
INSERT INTO tenants (id,slug,name) VALUES
('14000000-0000-4000-8000-000000000001','incident-a','Incident A'),
('14000000-0000-4000-8000-000000000002','incident-b','Incident B');
INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES
('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','Fenchurch','IF','Europe/London'),
('24000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','Lincoln','IL','Europe/London'),
('24000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000002','Other','IO','Europe/London');
INSERT INTO org_units (id,tenant_id,level,name,metadata) VALUES
('44000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','site','F site','{"hospitalityPropertyId":"24000000-0000-4000-8000-000000000001"}'),
('44000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','site','L site','{"hospitalityPropertyId":"24000000-0000-4000-8000-000000000002"}'),
('44000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000002','site','O site','{"hospitalityPropertyId":"24000000-0000-4000-8000-000000000003"}');
INSERT INTO incidents (id,tenant_id,site_org_unit_id,reference,type,severity,title,occurred_at) VALUES
('74000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','INC-F','other','no_injury','F incident',now()),
('74000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002','INC-L','other','no_injury','L incident',now()),
('74000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000003','INC-O','other','no_injury','O incident',now());
INSERT INTO incident_people (id,tenant_id,incident_id,person_name_text,role) VALUES
('84000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','F witness','witness'),
('84000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','L witness','witness'),
('84000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003','O witness','witness');

INSERT INTO attachments (id,tenant_id,kind,r2_key,content_type,size_bytes,filename) VALUES
('94000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','image','t/14000000-0000-4000-8000-000000000001/image/f.jpg','image/jpeg',3,'f.jpg'),
('94000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','image','t/14000000-0000-4000-8000-000000000001/image/l.jpg','image/jpeg',3,'l.jpg'),
('94000000-0000-4000-8000-000000000003','14000000-0000-4000-8000-000000000002','image','t/14000000-0000-4000-8000-000000000002/image/o.jpg','image/jpeg',3,'o.jpg');
INSERT INTO incident_attachments (tenant_id,incident_id,attachment_id) VALUES
('14000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001'),
('14000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000002'),
('14000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003','94000000-0000-4000-8000-000000000003');
INSERT INTO corrective_actions (tenant_id,reference,title,source_entity_type,source_entity_id) VALUES
('14000000-0000-4000-8000-000000000001','INC-J-F','F follow-up','incident','74000000-0000-4000-8000-000000000001'),
('14000000-0000-4000-8000-000000000001','INC-J-L','L follow-up','incident','74000000-0000-4000-8000-000000000002');

CREATE FUNCTION pg_temp.expect_count(query text, expected bigint) RETURNS void LANGUAGE plpgsql AS $$ DECLARE actual bigint; BEGIN EXECUTE query INTO actual; IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %: %',expected,actual,query; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(query text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE query; EXCEPTION WHEN insufficient_privilege OR foreign_key_violation OR check_violation OR unique_violation THEN RETURN; END; RAISE EXCEPTION 'Unexpectedly accepted: %',query; END $$;

SET LOCAL ROLE beaconhs_app;
SELECT set_config('app.tenant_id','14000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["24000000-0000-4000-8000-000000000001"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM incidents',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM incident_people',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM incident_attachments',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM incidents WHERE id=''74000000-0000-4000-8000-000000000002''',0);
SELECT pg_temp.expect_denied('INSERT INTO incidents (tenant_id,site_org_unit_id,reference,type,severity,title,occurred_at) VALUES (''14000000-0000-4000-8000-000000000001'',''44000000-0000-4000-8000-000000000002'',''INC-FORGED'',''other'',''no_injury'',''forged hotel'',now())');
SELECT pg_temp.expect_denied('UPDATE incident_attachments SET incident_id=''74000000-0000-4000-8000-000000000002'' WHERE attachment_id=''94000000-0000-4000-8000-000000000001''');
SELECT pg_temp.expect_denied('INSERT INTO incident_attachments (tenant_id,incident_id,attachment_id) VALUES (''14000000-0000-4000-8000-000000000001'',''74000000-0000-4000-8000-000000000001'',''94000000-0000-4000-8000-000000000003'')');
SELECT pg_temp.expect_denied('INSERT INTO corrective_actions (tenant_id,reference,title,source_entity_type,source_entity_id) VALUES (''14000000-0000-4000-8000-000000000001'',''INC-J-FORGED'',''forged source'',''incident'',''74000000-0000-4000-8000-000000000002'')');
SELECT pg_temp.expect_denied('INSERT INTO incident_people (tenant_id,incident_id,person_name_text) VALUES (''14000000-0000-4000-8000-000000000001'',''74000000-0000-4000-8000-000000000002'',''forged'')');
SELECT set_config('app.action_property_ids','["24000000-0000-4000-8000-000000000001","24000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM incidents',2);
SELECT pg_temp.expect_count('SELECT count(*) FROM incident_people',2);
SELECT pg_temp.expect_count('SELECT count(*) FROM incident_attachments',2);
SELECT pg_temp.expect_count('SELECT count(*) FROM corrective_actions',2);
SELECT set_config('app.action_property_ids','[]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM incidents',0);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM incidents',2);
SELECT set_config('app.tenant_id','14000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM incidents',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM incident_people',1);
RESET ROLE;
ROLLBACK;
SELECT 'Incident property RLS integration: PASS' AS result;
