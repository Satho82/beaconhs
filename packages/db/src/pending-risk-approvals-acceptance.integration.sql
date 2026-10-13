-- Disposable post-63 restore only. The invoking harness must bind Docker identity.
-- All fixture data and helper functions are rolled back; never use against DEV.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO tenants(id,slug,name) VALUES
 ('d0630000-0000-4000-8000-000000000001','d063-a','Fixture A'),
 ('d0630000-0000-4000-8000-000000000002','d063-b','Fixture B');
INSERT INTO hospitality_properties(id,tenant_id,name,code,timezone) VALUES
 ('d0630000-0000-4000-8000-000000000011','d0630000-0000-4000-8000-000000000001','A1','D063-A1','UTC'),
 ('d0630000-0000-4000-8000-000000000012','d0630000-0000-4000-8000-000000000001','A2','D063-A2','UTC'),
 ('d0630000-0000-4000-8000-000000000013','d0630000-0000-4000-8000-000000000002','B1','D063-B1','UTC');
INSERT INTO approval_workflows(tenant_id,property_id,name,stages)
 SELECT tenant_id,id,'D063 fixture','[{"name":"Review"}]'::jsonb
 FROM hospitality_properties WHERE code LIKE 'D063-%';
CREATE FUNCTION pg_temp.expect_count(expected integer) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF (SELECT count(*) FROM approval_workflows WHERE name='D063 fixture')<>expected
 THEN RAISE EXCEPTION 'Approval tenant/property visibility mismatch'; END IF; END $$;
CREATE FUNCTION pg_temp.reject_workflow(target_tenant uuid,target_property uuid) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN
   BEGIN
     INSERT INTO approval_workflows(tenant_id,property_id,name,stages)
       VALUES(target_tenant,target_property,'D063 denied','[{"name":"Review"}]');
   EXCEPTION WHEN insufficient_privilege THEN RETURN;
   END;
   RAISE EXCEPTION 'Approval tenant/property write unexpectedly succeeded';
 END $$;
SET LOCAL ROLE beaconhs_app;
SELECT set_config('app.tenant_id','d0630000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["d0630000-0000-4000-8000-000000000011"]',true);
SELECT pg_temp.expect_count(1);
SELECT pg_temp.reject_workflow('d0630000-0000-4000-8000-000000000001','d0630000-0000-4000-8000-000000000012');
SELECT pg_temp.reject_workflow('d0630000-0000-4000-8000-000000000002','d0630000-0000-4000-8000-000000000013');
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.expect_count(2);
SELECT set_config('app.action_scope_mode','',true);
SELECT pg_temp.expect_count(0);
SELECT set_config('app.tenant_id','',true);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.expect_count(0);
RESET ROLE;
ROLLBACK;
