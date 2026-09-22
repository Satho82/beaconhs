-- Run only in a disposable database after migrations and RLS installation.
BEGIN;
CREATE ROLE uvanoo_metering_test NOLOGIN;
GRANT USAGE ON SCHEMA public TO uvanoo_metering_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uvanoo_metering_test;

INSERT INTO tenants (id,slug,name) VALUES
('12000000-0000-4000-8000-000000000001','meter-a','Meter A'),
('12000000-0000-4000-8000-000000000002','meter-b','Meter B');
INSERT INTO "user" (id,email,name) VALUES
('meter-f','meter-f@example.invalid','F Manager'),
('meter-l','meter-l@example.invalid','L Manager'),
('meter-o','meter-o@example.invalid','Other Manager');
INSERT INTO tenant_users (id,tenant_id,user_id) VALUES
('32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','meter-f'),
('32000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','meter-l'),
('32000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002','meter-o');
INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES
('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','Fenchurch','MF','Europe/London'),
('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','Lincoln','ML','Europe/London'),
('22000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002','Other','MO','Europe/London');
INSERT INTO hospitality_meters (id,tenant_id,property_id,name,meter_type,location,serial_number,mpan,measurement_unit,installed_at,opening_reading,created_by_id) VALUES
('52000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','F electricity','electricity','Plant','SER-F','MPAN-F','kWh','2026-01-01',100,'32000000-0000-4000-8000-000000000001'),
('52000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','L water','water','Basement','SER-L',NULL,'m3','2026-01-01',50,'32000000-0000-4000-8000-000000000002'),
('52000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000003','O gas','gas','Roof','SER-O',NULL,'m3','2026-01-01',20,'32000000-0000-4000-8000-000000000003');
INSERT INTO hospitality_meter_tariffs (id,tenant_id,meter_id,unit_cost,currency,effective_from,created_by_id) VALUES
('62000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',0.25,'GBP','2026-01-01','32000000-0000-4000-8000-000000000001'),
('62000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002',0.10,'GBP','2026-01-01','32000000-0000-4000-8000-000000000002');
INSERT INTO hospitality_meter_readings (id,tenant_id,meter_id,reading_value,read_at,reading_type,submitted_by_id,consumption,tariff_id,unit_cost_snapshot,currency_snapshot,estimated_expenditure) VALUES
('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',120,'2026-02-01','normal','32000000-0000-4000-8000-000000000001',20,'62000000-0000-4000-8000-000000000001',0.25,'GBP',5),
('72000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002',60,'2026-02-01','normal','32000000-0000-4000-8000-000000000002',10,'62000000-0000-4000-8000-000000000002',0.10,'GBP',1);

CREATE FUNCTION pg_temp.expect_count(query text, expected bigint) RETURNS void LANGUAGE plpgsql AS $$ DECLARE actual bigint; BEGIN EXECUTE query INTO actual; IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %: %',expected,actual,query; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(query text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE query; EXCEPTION WHEN insufficient_privilege THEN RETURN; END; RAISE EXCEPTION 'Unexpectedly accepted: %',query; END $$;

SET LOCAL ROLE uvanoo_metering_test;
SELECT set_config('app.tenant_id','12000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["22000000-0000-4000-8000-000000000001"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meters',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meter_tariffs',1);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meter_readings',1);
SELECT pg_temp.expect_denied('INSERT INTO hospitality_meter_readings (tenant_id,meter_id,reading_value,read_at,submitted_by_id) VALUES (''12000000-0000-4000-8000-000000000001'',''52000000-0000-4000-8000-000000000002'',70,now(),''32000000-0000-4000-8000-000000000001'')');
SELECT set_config('app.action_property_ids','["22000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meters',1);
SELECT set_config('app.action_property_ids','["22000000-0000-4000-8000-000000000001","22000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meters',2);
SELECT set_config('app.action_property_ids','[]',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meters',0);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meters',2);
SELECT set_config('app.tenant_id','12000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.expect_count('SELECT count(*) FROM hospitality_meters',1);
RESET ROLE;
ROLLBACK;
SELECT 'Hospitality Metering RLS integration: PASS' AS result;
