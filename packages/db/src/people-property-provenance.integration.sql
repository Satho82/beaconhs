-- Disposable PostgreSQL only, after migrations and RLS installation.
-- Retained regression: hidden assignments are not unassigned people.
-- Keep the original zero-row expectation after installing migration 0057.
BEGIN;
INSERT INTO tenants (id,slug,name) VALUES ('19000000-0000-4000-8000-000000000001','provenance-diagnostic','Disposable diagnostic');
INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES ('29000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000001','Test hotel','TEST','UTC');
INSERT INTO org_units (id,tenant_id,level,name,metadata) VALUES ('39000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000001','site','Hotel site','{"hospitalityPropertyId":"29000000-0000-4000-8000-000000000001"}');
INSERT INTO people (id,tenant_id,first_name,last_name) VALUES
('49000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000001','Hotel','Person'),
('49000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000001','Unassigned','Person');
INSERT INTO people_assignments (tenant_id,person_id,org_unit_id,valid_from) VALUES ('19000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000001',current_date);
CREATE FUNCTION pg_temp.expect_count(query text, expected bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual bigint; BEGIN EXECUTE query INTO actual;
IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %: %',expected,actual,query; END IF; END $$;
SET LOCAL ROLE beaconhs_app;
SELECT set_config('app.tenant_id','19000000-0000-4000-8000-000000000001',true),set_config('app.action_scope_mode','legacy',true),set_config('app.action_property_ids','[]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM people_assignments',0);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM people WHERE first_name='Unassigned'$query$,1);
SELECT pg_temp.expect_count($query$SELECT count(*) FROM people WHERE first_name='Hotel'$query$,0);
RESET ROLE;
ROLLBACK;
SELECT 'People property provenance integration: PASS' AS result;
