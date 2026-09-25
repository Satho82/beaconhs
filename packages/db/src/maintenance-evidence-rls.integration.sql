-- Run only in a disposable database after migrations and RLS installation.
BEGIN;
INSERT INTO tenants (id,slug,name) VALUES
('13000000-0000-4000-8000-000000000001','evidence-a','Evidence A'),
('13000000-0000-4000-8000-000000000002','evidence-b','Evidence B');
INSERT INTO "user" (id,email,name) VALUES
('evidence-user','evidence@example.invalid','Evidence User');
INSERT INTO tenant_users (id,tenant_id,user_id) VALUES
('33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','evidence-user');
INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES
('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','Fenchurch','EF','Europe/London'),
('23000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','Lincoln','EL','Europe/London'),
('23000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','Other','EO','Europe/London');
INSERT INTO hospitality_buildings (id,tenant_id,property_id,name,code) VALUES
('43000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','F Building','FB'),
('43000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','L Building','LB'),
('43000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000003','O Building','OB');
INSERT INTO hospitality_floors (id,tenant_id,building_id,name,code) VALUES
('53000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','F Floor','FF'),
('53000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000002','L Floor','LF'),
('53000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000003','O Floor','OF');
INSERT INTO hospitality_rooms (id,tenant_id,floor_id,code,name) VALUES
('63000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','101','F Room'),
('63000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000002','201','L Room'),
('63000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000003','301','O Room');
INSERT INTO maintenance_issues (id,tenant_id,room_id,reference,summary) VALUES
('73000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','MI-EF','F issue'),
('73000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','MI-EL','L issue'),
('73000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000003','MI-EO','O issue');
INSERT INTO attachments (id,tenant_id,kind,r2_key,content_type,size_bytes,filename) VALUES
('83000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','image','t/13000000-0000-4000-8000-000000000001/image/f.jpg','image/jpeg',3,'f.jpg'),
('83000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','image','t/13000000-0000-4000-8000-000000000001/image/l.jpg','image/jpeg',3,'l.jpg'),
('83000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','image','t/13000000-0000-4000-8000-000000000002/image/o.jpg','image/jpeg',3,'o.jpg');
INSERT INTO maintenance_issue_attachments (id,tenant_id,issue_id,attachment_id,stage,source,uploaded_by_tenant_user_id) VALUES
('93000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','before_work','staff','33000000-0000-4000-8000-000000000001'),
('93000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002','after_work','guest_qr',NULL),
('93000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000003','completion','guest_qr',NULL);

CREATE FUNCTION pg_temp.expect_count(query text, expected bigint) RETURNS void LANGUAGE plpgsql AS $$ DECLARE actual bigint; BEGIN EXECUTE query INTO actual; IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %: %',expected,actual,query; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(query text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE query; EXCEPTION WHEN insufficient_privilege OR foreign_key_violation OR check_violation OR unique_violation THEN RETURN; END; RAISE EXCEPTION 'Unexpectedly accepted: %',query; END $$;

SET LOCAL ROLE beaconhs_app;
SELECT set_config('app.tenant_id','13000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["23000000-0000-4000-8000-000000000001"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM maintenance_issues',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM maintenance_issue_attachments',1);
SELECT pg_temp.expect_denied('INSERT INTO maintenance_issue_attachments (tenant_id,issue_id,attachment_id,stage,source) VALUES (''13000000-0000-4000-8000-000000000001'',''73000000-0000-4000-8000-000000000002'',''83000000-0000-4000-8000-000000000001'',''reported'',''staff'')');
SELECT set_config('app.action_property_ids','["23000000-0000-4000-8000-000000000001","23000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM maintenance_issue_attachments',2);
SELECT set_config('app.action_property_ids','[]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM maintenance_issue_attachments',0);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM maintenance_issue_attachments',2);
SELECT pg_temp.expect_denied('INSERT INTO maintenance_issue_attachments (tenant_id,issue_id,attachment_id,stage,source) VALUES (''13000000-0000-4000-8000-000000000001'',''73000000-0000-4000-8000-000000000001'',''83000000-0000-4000-8000-000000000003'',''reported'',''guest_qr'')');
SELECT set_config('app.tenant_id','13000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM maintenance_issue_attachments',1);
RESET ROLE;
ROLLBACK;
SELECT 'Maintenance evidence RLS integration: PASS' AS result;
