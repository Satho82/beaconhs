-- Run ONLY in a disposable database after the complete migration and RLS installers.
-- All fixtures, grants, and the temporary production-style role roll back.
BEGIN;
CREATE ROLE uvanoo_handover_test NOLOGIN;
GRANT USAGE ON SCHEMA public TO uvanoo_handover_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uvanoo_handover_test;

INSERT INTO tenants (id,slug,name) VALUES
('11000000-0000-4000-8000-000000000001','handover-a','Handover A'),
('11000000-0000-4000-8000-000000000002','handover-b','Handover B');
INSERT INTO "user" (id,email,name) VALUES
('handover-f','handover-f@example.invalid','F Manager'),
('handover-l','handover-l@example.invalid','L Manager'),
('handover-o','handover-o@example.invalid','Other Manager');
INSERT INTO tenant_users (id,tenant_id,user_id) VALUES
('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','handover-f'),
('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','handover-l'),
('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','handover-o');
INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Fenchurch','HF','Europe/London'),
('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','Lincoln','HL','Europe/London'),
('21000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','Other','HO','Europe/London');
INSERT INTO hospitality_handovers
(id,tenant_id,property_id,occurred_at,shift,department,note,priority,author_id,follow_up_required,follow_up_status) VALUES
('51000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001',now(),'am','Front Office','F handover','important','31000000-0000-4000-8000-000000000001',true,'open'),
('51000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002',now(),'pm','Housekeeping','L handover','routine','31000000-0000-4000-8000-000000000002',false,'not_required'),
('51000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003',now(),'night','Front Office','Other handover','urgent','31000000-0000-4000-8000-000000000003',false,'not_required');
INSERT INTO hospitality_handover_comments (tenant_id,handover_id,author_id,body) VALUES
('11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','F update'),
('11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','L update');
INSERT INTO hospitality_handover_acknowledgements (tenant_id,handover_id,author_id) VALUES
('11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001'),
('11000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002');

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

SET LOCAL ROLE uvanoo_handover_test;
SELECT set_config('app.tenant_id','11000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["21000000-0000-4000-8000-000000000001"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handovers',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handover_comments',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handover_acknowledgements',1);
SELECT pg_temp.expect_denied('INSERT INTO hospitality_handovers (tenant_id,property_id,occurred_at,shift,department,note,priority,author_id) VALUES (''11000000-0000-4000-8000-000000000001'',''21000000-0000-4000-8000-000000000002'',now(),''am'',''Bad'',''Forged property'',''routine'',''31000000-0000-4000-8000-000000000001'')');
SELECT pg_temp.expect_denied('INSERT INTO hospitality_handover_comments (tenant_id,handover_id,author_id,body) VALUES (''11000000-0000-4000-8000-000000000001'',''51000000-0000-4000-8000-000000000002'',''31000000-0000-4000-8000-000000000001'',''Forged child'')');
SELECT set_config('app.action_property_ids','["21000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handovers',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handover_comments',1);
SELECT set_config('app.action_property_ids','["21000000-0000-4000-8000-000000000001","21000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handovers',2);
SELECT set_config('app.action_property_ids','[]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handovers',0);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handovers',2);
SELECT set_config('app.tenant_id','11000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_handovers',1);
RESET ROLE;
ROLLBACK;
SELECT 'Hotel Handover RLS integration: PASS' AS result;
