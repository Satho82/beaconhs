"""Explicit isolated Docker integration tests; no URLs or environment credentials.

Requires correction_fixture cloned from pristine58 in an explicitly disposable
container. Fixture data and DDL roll back. Only enum0059 persists in fixture DB.
Never runs against the pristine container or the actual-data rehearsal database.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
IMAGE = 'sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d'
FIXTURE = """
INSERT INTO tenants(id,slug,name) VALUES
 ('d0600000-0000-4000-8000-000000000001','d060-a','Fixture A'),
 ('d0600000-0000-4000-8000-000000000002','d060-b','Fixture B');
INSERT INTO "user"(id,email,name) VALUES
 ('d060-a','d060-a@example.invalid','Fixture A'),('d060-b','d060-b@example.invalid','Fixture B');
INSERT INTO tenant_users(id,tenant_id,user_id)
 SELECT ('d0600000-0000-4000-8000-00000000001'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000000'||n)::uuid,'d060-'||CASE n WHEN 1 THEN 'a' ELSE 'b' END
 FROM generate_series(1,2) n;
INSERT INTO hospitality_properties(id,tenant_id,name,code,timezone)
 SELECT ('d0600000-0000-4000-8000-00000000002'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000000'||n)::uuid,'Fixture','D060-'||n,'Europe/London'
 FROM generate_series(1,2) n;
INSERT INTO risk_templates(id,tenant_id,owner_key,scope,title,category,description,version,state)
 SELECT ('d0600000-0000-4000-8000-00000000003'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000000'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000000'||n)::uuid,'tenant','Fixture','general','Fixture','1.0','draft'
 FROM generate_series(1,2) n;
INSERT INTO risk_assessments(id,tenant_id,property_id,template_owner_key,template_id,
 adopted_template_version,adopted_template_snapshot,reference,title,
 creator_tenant_user_id,assessor_tenant_user_id,assessment_date)
 SELECT ('d0600000-0000-4000-8000-00000000004'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000000'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000002'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000000'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000003'||n)::uuid,
 '1.0','{"version":"1.0","category":"general"}','D060-'||n,'Fixture',
 ('d0600000-0000-4000-8000-00000000001'||n)::uuid,
 ('d0600000-0000-4000-8000-00000000001'||n)::uuid,current_date FROM generate_series(1,2) n;
INSERT INTO risk_hazards(tenant_id,assessment_id,hazard_description,harm_description,
 initial_likelihood,initial_severity,initial_score,controls,residual_likelihood,residual_severity,residual_score)
 SELECT tenant_id,id,'Fixture hazard','Fixture harm',1,1,1,'Fixture control',1,1,1
 FROM risk_assessments WHERE reference LIKE 'D060-%';
"""

ASSERTIONS = """
RESET ROLE;
DO $test$ BEGIN
 IF EXISTS (SELECT 1 FROM risk_templates t LEFT JOIN risk_template_families f
 ON (f.owner_key,f.id)=(t.owner_key,t.template_family_id)
 WHERE f.id IS NULL OR t.template_family_id<>t.id OR NOT risk_matrix_snapshot_valid(t.matrix_snapshot))
 THEN RAISE EXCEPTION 'Incomplete family or matrix backfill'; END IF;
 IF (SELECT count(*) FROM risk_templates WHERE tenant_id IS NULL)<>1 OR
 (SELECT count(*) FROM risk_templates WHERE title='Fixture')<>2 OR
 (SELECT count(*) FROM risk_assessments WHERE reference LIKE 'D060-%' AND assessment_category='general' AND matrix_snapshot IS NULL)<>2
 THEN RAISE EXCEPTION 'Incomplete platform/tenant/assessment coverage'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polname LIKE 'migration_0060_%') OR
 EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('risk_templates'::regclass,'risk_assessments'::regclass)
 AND NOT (relrowsecurity AND relforcerowsecurity))
 THEN RAISE EXCEPTION 'Policy leaked or FORCE RLS changed'; END IF;
END $test$;
CREATE FUNCTION pg_temp.expect_error(q text, code text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=code THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'Expected rejection'; END $$;
-- Missing and cross-owner references remain rejected even for fixture admin.
SELECT pg_temp.expect_error($q$INSERT INTO risk_templates(tenant_id,owner_key,scope,title,category,description,version,state,template_family_id,matrix_snapshot)
 SELECT tenant_id,owner_key,scope,'Missing family',category,description,'2.0','draft','d0600000-0000-4000-8000-000000000099',matrix_snapshot FROM risk_templates WHERE id='d0600000-0000-4000-8000-000000000031'$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO risk_templates(tenant_id,owner_key,scope,title,category,description,version,state,template_family_id,matrix_snapshot)
 SELECT tenant_id,owner_key,scope,'Cross family',category,description,'2.0','draft','d0600000-0000-4000-8000-000000000032',matrix_snapshot FROM risk_templates WHERE id='d0600000-0000-4000-8000-000000000031'$q$,'23514');
SET LOCAL ROLE beaconhs_app;
SELECT set_config('app.tenant_id','d0600000-0000-4000-8000-000000000001',true);
DO $test$ DECLARE n integer; BEGIN
 IF (SELECT count(*) FROM risk_templates WHERE title='Fixture')<>1 THEN RAISE EXCEPTION 'Cross tenant read'; END IF;
 UPDATE risk_templates SET title='Forbidden' WHERE tenant_id IS NULL OR tenant_id='d0600000-0000-4000-8000-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Platform or cross tenant write'; END IF;
END $test$;
SELECT pg_temp.expect_error($q$INSERT INTO risk_template_families(tenant_id,owner_key,scope) VALUES ('d0600000-0000-4000-8000-000000000002','d0600000-0000-4000-8000-000000000002','tenant')$q$,'42501');
"""

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--container', required=True)
    p.add_argument('--safety-only', action='store_true')
    args = p.parse_args()
    assert re.fullmatch(r'uvanoo-db-only-correction-[0-9a-f]{12}', args.container)
    c = json.loads(subprocess.check_output(['docker','inspect',args.container]))[0]
    h = c['HostConfig']
    assert c['Image']==IMAGE and c['Config']['Labels']['uvanoo.kind']=='rehearsal'
    assert h['NetworkMode']=='none' and not h.get('PortBindings') and not h['Privileged']
    assert h['Memory']==2147483648 and h['NanoCpus']==1000000000
    assert len(c['Mounts'])==1 and c['Mounts'][0]['Name']==args.container+'-data'
    command=['docker','exec','-i',args.container,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','uvanoo_dev','-d','correction_fixture']
    def run(sql, code=None):
        result=subprocess.run(command,input=sql.encode(),capture_output=True,timeout=120)
        if code:
            assert result.returncode!=0 and re.search(rb'ERROR:\s+'+code.encode()+rb':',result.stderr), 'EXPECTED_SQLSTATE_'+code
        else:
            if result.returncode:
                match=re.search(rb'ERROR:\s+([A-Z0-9]{5}):',result.stderr)
                raise AssertionError('SQLSTATE_'+(match[1].decode() if match else 'UNKNOWN'))
        return result.stdout
    assert run('SELECT count(*) FROM drizzle.__drizzle_migrations;').strip()==b'58'
    migration=(ROOT/'packages/db/drizzle/0060_risk_template_families_manual_assessments.sql').read_text()
    revision=(ROOT/'packages/db/drizzle/0061_risk_assessment_revisions_archive_signoffs.sql').read_text()
    run("SET ROLE beaconhs_owner; ALTER TYPE risk_template_state ADD VALUE IF NOT EXISTS 'draft';")
    prefix='BEGIN; SET LOCAL statement_timeout=120000;'+FIXTURE+'SET LOCAL ROLE beaconhs_owner;'
    if args.safety_only:
        during = """
        DO $policy_test$ DECLARE n integer; BEGIN
          SET LOCAL ROLE beaconhs_app;
          PERFORM set_config('app.tenant_id','d0600000-0000-4000-8000-000000000001',true);
          IF (SELECT count(*) FROM risk_templates WHERE title='Fixture')<>1
            THEN RAISE EXCEPTION 'Temporary policy exposed another tenant'; END IF;
          UPDATE risk_templates SET title='Forbidden' WHERE tenant_id IS NULL OR
            tenant_id='d0600000-0000-4000-8000-000000000002';
          GET DIAGNOSTICS n=ROW_COUNT;
          IF n<>0 THEN RAISE EXCEPTION 'Temporary policy allowed application writes'; END IF;
          SET LOCAL ROLE beaconhs_owner;
          PERFORM set_config('app.tenant_id','',true);
        END $policy_test$;
        """
        run(prefix+migration.replace('-- CHECK expressions',during+'-- CHECK expressions')+ASSERTIONS+'ROLLBACK;')
        print('PASS application isolation while temporary owner policies exist',flush=True)
        run('BEGIN;'+FIXTURE+migration,'P0001')
        print('PASS wrong execution role rejected',flush=True)
        run(prefix+migration+revision.replace('FROM risk_assessments ra;',"FROM risk_assessments ra; RAISE EXCEPTION USING ERRCODE='P6061',MESSAGE='Injected rollback';"),'P6061')
        assert run("SELECT to_regclass('risk_template_families') IS NULL AND to_regclass('risk_assessment_versions') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname LIKE 'migration_006%');").strip()==b't'
        print('PASS 0061 failure rolls back data, DDL and temporary policies',flush=True)
        return
    run(prefix+migration+ASSERTIONS+'ROLLBACK;')
    print('PASS platform/tenant backfill, assessment categories, references, RLS and policy removal',flush=True)
    for label,sql,code in [
      ('injected rollback',prefix+migration.replace('ALTER TABLE risk_templates ALTER COLUMN matrix_snapshot SET NOT NULL;',"RAISE EXCEPTION USING ERRCODE='P6060', MESSAGE='Injected rollback';"),'P6060'),
      ('missing families',prefix+migration.replace('SELECT id, tenant_id, owner_key, scope FROM risk_templates;', 'SELECT id, tenant_id, owner_key, scope FROM risk_templates WHERE false;'),'23503'),
      ('invalid source category','BEGIN;'+FIXTURE+"UPDATE risk_assessments SET adopted_template_snapshot=adopted_template_snapshot-'category' WHERE reference LIKE 'D060-%'; SET LOCAL ROLE beaconhs_owner;"+migration,'23502'),
    ]:
        run(sql,code)
        assert run("SELECT to_regclass('risk_template_families') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname LIKE 'migration_0060_%') AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='risk_templates'::regclass AND attname='template_family_id') AND NOT EXISTS(SELECT 1 FROM tenants WHERE slug='d060-a');").strip()==b't'
        print('PASS '+label+' fully rolled back',flush=True)
    run(prefix+migration+revision+"""RESET ROLE;
    DO $test$ BEGIN
      IF (SELECT count(*) FROM risk_assessment_versions WHERE event='baseline')<>2 OR
      EXISTS(SELECT 1 FROM risk_assessment_versions WHERE jsonb_array_length(snapshot->'hazards')<>1
       OR snapshot->'property'='null'::jsonb OR snapshot->'tenant'='null'::jsonb)
      THEN RAISE EXCEPTION 'Incomplete tenant baseline'; END IF;
    END $test$; ROLLBACK;""")
    print('PASS 0061 tenant baselines include hazards, property and tenant under FORCE RLS',flush=True)

if __name__=='__main__':
    main()
