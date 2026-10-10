-- PREPARED, NOT EXECUTED. Run only in an explicitly approved disposable database
-- after 0059, 0060, 0061 and the canonical RLS installer. Requires an administrative
-- fixture connection. Never point this test at the preserved preview or DEV.
-- No migration is applied by this file. All fixtures and temporary roles roll back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$ BEGIN
  IF to_regclass('public.risk_assessment_versions') IS NULL THEN
    RAISE EXCEPTION 'Prepared risk migrations have not been applied to this test database';
  END IF;
END $$;

CREATE ROLE uvanoo_risk_bypass_test NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO uvanoo_risk_bypass_test;
GRANT SELECT, UPDATE, DELETE, TRUNCATE ON risk_assessment_versions, risk_assessment_signoffs TO uvanoo_risk_bypass_test;
INSERT INTO tenants(id,slug,name) VALUES
 ('d1250000-0000-4000-8000-000000000001','d125-test-a','Decision 125 A'),
 ('d1250000-0000-4000-8000-000000000002','d125-test-b','Decision 125 B');
INSERT INTO "user"(id,email,name) VALUES
 ('d125-a','d125-a@example.invalid','Test A'),('d125-b','d125-b@example.invalid','Test B');
INSERT INTO tenant_users(id,tenant_id,user_id) VALUES
 ('d1250000-0000-4000-8000-000000000011','d1250000-0000-4000-8000-000000000001','d125-a'),
 ('d1250000-0000-4000-8000-000000000012','d1250000-0000-4000-8000-000000000002','d125-b');
INSERT INTO hospitality_properties(id,tenant_id,name,code,timezone) VALUES
 ('d1250000-0000-4000-8000-000000000021','d1250000-0000-4000-8000-000000000001','A1','D125-A1','Europe/London'),
 ('d1250000-0000-4000-8000-000000000022','d1250000-0000-4000-8000-000000000001','A2','D125-A2','Europe/London'),
 ('d1250000-0000-4000-8000-000000000023','d1250000-0000-4000-8000-000000000002','B1','D125-B1','Europe/London');
CREATE TEMP TABLE risk_test_matrix(value jsonb);
INSERT INTO risk_test_matrix
SELECT jsonb_build_object('schemaVersion',1,'modelKey','uvanoo-5x5-v1','size',5,
 'axes',jsonb_build_object('severity',jsonb_build_object('values',jsonb_build_array('1','2','3','4','5')),
                         'likelihood',jsonb_build_object('values',jsonb_build_array('1','2','3','4','5'))),
 'cells',jsonb_object_agg((s-1)::text||':'||(l-1)::text,jsonb_build_object('score',s*l,
   'label',CASE WHEN s*l<=4 THEN 'Low' WHEN s*l<=9 THEN 'Medium' WHEN s*l<=16 THEN 'High' ELSE 'Critical' END,
   'color',CASE WHEN s*l<=4 THEN '#10b981' WHEN s*l<=9 THEN '#f59e0b' WHEN s*l<=16 THEN '#f97316' ELSE '#dc2626' END)))
FROM generate_series(1,5) s CROSS JOIN generate_series(1,5) l;

INSERT INTO risk_assessments(id,tenant_id,property_id,source_kind,assessment_category,matrix_snapshot,
 reference,title,creator_tenant_user_id,assessor_tenant_user_id,assessment_date)
SELECT v.id::uuid,v.tenant::uuid,v.property::uuid,'manual','general',m.value,v.ref,v.ref,
 v.actor::uuid,v.actor::uuid,current_date FROM risk_test_matrix m CROSS JOIN (VALUES
 ('d1250000-0000-4000-8000-000000000031','d1250000-0000-4000-8000-000000000001','d1250000-0000-4000-8000-000000000021','D125-A1','d1250000-0000-4000-8000-000000000011'),
 ('d1250000-0000-4000-8000-000000000032','d1250000-0000-4000-8000-000000000001','d1250000-0000-4000-8000-000000000022','D125-A2','d1250000-0000-4000-8000-000000000011'),
 ('d1250000-0000-4000-8000-000000000033','d1250000-0000-4000-8000-000000000002','d1250000-0000-4000-8000-000000000023','D125-B1','d1250000-0000-4000-8000-000000000012')
) v(id,tenant,property,ref,actor);
INSERT INTO risk_assessment_versions(tenant_id,assessment_id,revision,actor_tenant_user_id,event,snapshot)
SELECT tenant_id,id,1,creator_tenant_user_id,'adopted',
 public.risk_capture_content(tenant_id,id)||jsonb_build_object('schemaVersion',2,'tenantId',tenant_id,
 'assessmentId',id,'contentRevision',1,'provenance',jsonb_build_object('kind','application_revision'))
FROM risk_assessments WHERE reference LIKE 'D125-%';
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

CREATE FUNCTION pg_temp.risk_expect_count(query text,expected bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual bigint; BEGIN EXECUTE query INTO actual;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %',expected,actual; END IF;
END $$;
CREATE FUNCTION pg_temp.risk_expect_error(query text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; SET CONSTRAINTS ALL IMMEDIATE;
 EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE = expected THEN RETURN; END IF;
   RAISE;
 END;
 RAISE EXCEPTION 'Mutation unexpectedly succeeded';
END $$;

SET LOCAL ROLE beaconhs_app;
SELECT set_config('app.tenant_id','d1250000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["d1250000-0000-4000-8000-000000000021"]',true);
SELECT pg_temp.risk_expect_count($q$SELECT count(*) FROM risk_assessment_versions WHERE tenant_id IN ('d1250000-0000-4000-8000-000000000001','d1250000-0000-4000-8000-000000000002')$q$,1);
SELECT pg_temp.risk_expect_count($q$SELECT count(*) FROM risk_assessment_versions WHERE assessment_id='d1250000-0000-4000-8000-000000000032'$q$,0);
SELECT pg_temp.risk_expect_count($q$SELECT count(*) FROM risk_assessment_versions WHERE tenant_id='d1250000-0000-4000-8000-000000000002'$q$,0);
SELECT pg_temp.risk_expect_error($q$UPDATE risk_assessment_versions SET reason='tampered'$q$,'42501');
SELECT pg_temp.risk_expect_error($q$UPDATE risk_assessments SET title='Missing revision',content_revision=2 WHERE id='d1250000-0000-4000-8000-000000000031'$q$,'23514');
SELECT pg_temp.risk_expect_error($q$INSERT INTO risk_template_families(tenant_id,owner_key,scope) VALUES ('d1250000-0000-4000-8000-000000000002','d1250000-0000-4000-8000-000000000002','tenant')$q$,'42501');
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.risk_expect_count($q$SELECT count(*) FROM risk_assessment_versions WHERE tenant_id='d1250000-0000-4000-8000-000000000001'$q$,2);
SELECT set_config('app.action_scope_mode','',true);
SELECT pg_temp.risk_expect_count($q$SELECT count(*) FROM risk_assessment_versions WHERE tenant_id='d1250000-0000-4000-8000-000000000001'$q$,0);
RESET ROLE;
SET LOCAL ROLE uvanoo_risk_bypass_test;
SELECT pg_temp.risk_expect_error($q$UPDATE risk_assessment_versions SET reason='tampered' WHERE assessment_id='d1250000-0000-4000-8000-000000000031'$q$,'55000');
SELECT pg_temp.risk_expect_error($q$DELETE FROM risk_assessment_versions WHERE assessment_id='d1250000-0000-4000-8000-000000000031'$q$,'55000');
SELECT pg_temp.risk_expect_error($q$TRUNCATE risk_assessment_versions, risk_assessment_signoffs$q$,'55000');
RESET ROLE;
ROLLBACK;
