-- Disposable database only. Every fixture and attempted mutation is rolled back.
BEGIN;
INSERT INTO tenants (id,slug,name) VALUES
('16000000-0000-4000-8000-000000000001','k0-module-a','K0 Module A'),
('16000000-0000-4000-8000-000000000002','k0-module-b','K0 Module B');
INSERT INTO hospitality_properties (id,tenant_id,name,code,timezone) VALUES
('26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001','A1','A1','UTC'),
('26000000-0000-4000-8000-000000000002','16000000-0000-4000-8000-000000000001','A2','A2','UTC'),
('26000000-0000-4000-8000-000000000003','16000000-0000-4000-8000-000000000002','B1','B1','UTC');
INSERT INTO inspection_types (id,tenant_id,name) VALUES
('36000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001','Checklist A'),
('36000000-0000-4000-8000-000000000002','16000000-0000-4000-8000-000000000002','Checklist B');
INSERT INTO org_units (id,tenant_id,level,name,metadata)
SELECT id,tenant_id,'site',name,jsonb_build_object('hospitalityPropertyId',id) FROM hospitality_properties
WHERE id::text LIKE '26000000-%';
INSERT INTO inspection_records (id,tenant_id,type_id,reference,occurred_at,site_org_unit_id)
SELECT p.id,p.tenant_id,t.id,p.code,now(),p.id FROM hospitality_properties p
JOIN inspection_types t ON t.tenant_id=p.tenant_id WHERE p.id::text LIKE '26000000-%';
INSERT INTO equipment_inspection_records (id,tenant_id,reference,occurred_at,site_org_unit_id,is_rental,equipment_name_snapshot)
SELECT id,tenant_id,code,now(),id,true,'Rental fixture' FROM hospitality_properties WHERE id::text LIKE '26000000-%';
INSERT INTO inspection_record_criteria (tenant_id,record_id,question_text_snapshot,sequence)
SELECT tenant_id,id,'Check',1 FROM inspection_records WHERE id::text LIKE '26000000-%';
INSERT INTO equipment_inspection_record_criteria (tenant_id,record_id,question_text_snapshot,sequence)
SELECT tenant_id,id,'Check',1 FROM equipment_inspection_records WHERE id::text LIKE '26000000-%';
INSERT INTO compliance_obligations (id,tenant_id,source_module,subject_kind,title,target_ref,recurrence,recurrence_kind)
SELECT id,tenant_id,'journal','per_person',name,jsonb_build_object('propertyId',id),'{"kind":"one_time"}','one_time'
FROM hospitality_properties WHERE id::text LIKE '26000000-%';
INSERT INTO compliance_audience (tenant_id,obligation_id,kind)
SELECT tenant_id,id,'everyone' FROM compliance_obligations WHERE id::text LIKE '26000000-%';
INSERT INTO compliance_dispatches (tenant_id,obligation_id)
SELECT tenant_id,id FROM compliance_obligations WHERE id::text LIKE '26000000-%';

CREATE FUNCTION pg_temp.expect_count(query text, expected bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual bigint; BEGIN EXECUTE query INTO actual;
IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, got %: %',expected,actual,query; END IF; END $$;
CREATE FUNCTION pg_temp.expect_denied(query text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE query; EXCEPTION WHEN insufficient_privilege OR foreign_key_violation OR check_violation THEN RETURN; END;
RAISE EXCEPTION 'Unexpectedly accepted: %',query; END $$;
CREATE FUNCTION pg_temp.module_counts(expected bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE tab text; BEGIN
FOREACH tab IN ARRAY ARRAY['inspection_records','inspection_record_criteria','equipment_inspection_records','equipment_inspection_record_criteria','compliance_obligations','compliance_audience','compliance_dispatches']
LOOP PERFORM pg_temp.expect_count('SELECT count(*) FROM ' || quote_ident(tab),expected); END LOOP; END $$;

SET LOCAL ROLE beaconhs_app;
SELECT set_config('app.tenant_id','16000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.action_scope_mode','property',true);
SELECT set_config('app.action_property_ids','["26000000-0000-4000-8000-000000000001"]',true);
SELECT pg_temp.module_counts(1);
SELECT pg_temp.expect_denied('UPDATE inspection_records SET site_org_unit_id=''26000000-0000-4000-8000-000000000002''');
SELECT pg_temp.expect_denied('UPDATE inspection_records SET metadata=''{"propertyId":"26000000-0000-4000-8000-000000000002"}''');
SELECT pg_temp.expect_denied('UPDATE equipment_inspection_record_criteria SET record_id=''26000000-0000-4000-8000-000000000002''');
SELECT pg_temp.expect_denied('UPDATE compliance_obligations SET target_ref=''{"propertyId":"26000000-0000-4000-8000-000000000002"}''');
SELECT pg_temp.expect_denied('UPDATE compliance_audience SET obligation_id=''26000000-0000-4000-8000-000000000002''');
SELECT pg_temp.expect_denied('INSERT INTO compliance_obligations (tenant_id,source_module,subject_kind,title,target_ref,recurrence,recurrence_kind) VALUES (''16000000-0000-4000-8000-000000000001'',''journal'',''per_person'',''forged'',''{"propertyId":"26000000-0000-4000-8000-000000000003"}'',''{"kind":"one_time"}'',''one_time'')');
SELECT set_config('app.action_property_ids','["26000000-0000-4000-8000-000000000001","26000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.module_counts(2);
SELECT set_config('app.action_property_ids','["26000000-0000-4000-8000-000000000002"]',true);
SELECT pg_temp.module_counts(1);
SELECT set_config('app.action_property_ids','[]',true);
SELECT pg_temp.module_counts(0);
SELECT set_config('app.action_scope_mode','tenant',true);
SELECT pg_temp.module_counts(2);
SELECT set_config('app.tenant_id','16000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.module_counts(1);
RESET ROLE;
ROLLBACK;
SELECT 'Inspection and Compliance property isolation: PASS' AS result;

