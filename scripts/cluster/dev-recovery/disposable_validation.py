#!/usr/bin/env python3
"""Synthetic disposable contract test; never connects to DEV or uses DEV data."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid
import dev_recovery as r
import restore_disposable as restore

os.umask(0o077)
require = r.require


def isolated_executor_allowed():
    """Allow the synthetic fixture on CI or an explicitly local Docker daemon.

    The local escape hatch is intentionally narrow: it exists solely for the
    source-VPS, network-none synthetic rehearsal.  It rejects remote Docker
    contexts so the fixture cannot be pointed at another host by accident.
    It never accepts real data, live volume mounts, or a live PostgreSQL target.
    """
    if os.environ.get("GITHUB_ACTIONS") == "true":
        return
    require(os.environ.get("UVANOO_ISOLATED_REHEARSAL") == "true",
            "EXPLICIT_ISOLATED_REHEARSAL_REQUIRED")
    require(os.environ.get("DOCKER_CONTEXT", "default") == "default",
            "LOCAL_DOCKER_CONTEXT_REQUIRED")
    require(os.environ.get("DOCKER_HOST", "") in ("", "unix:///var/run/docker.sock"),
            "LOCAL_DOCKER_SOCKET_REQUIRED")


isolated_executor_allowed()
repo = Path(__file__).resolve().parents[3]
root = Path(tempfile.mkdtemp(prefix="uvanoo-backup-test-"))
os.chmod(root, 0o700)
source = "uvanoo-backup-test-" + uuid.uuid4().hex
os.environ["POSTGRES_PASSWORD"] = __import__("secrets").token_urlsafe(32)
try:
    r.run(["docker", "run", "-d", "--name", source, "--network", "none",
           "--memory", "2g", "--cpus", "1", "--pids-limit", "128",
           "--security-opt", "no-new-privileges", "--label", "uvanoo.recovery=synthetic-test",
           "-e", "POSTGRES_USER=uvanoo_dev", "-e", "POSTGRES_DB=beaconhs",
           "-e", "POSTGRES_PASSWORD", restore.IMAGE])
finally:
    os.environ.pop("POSTGRES_PASSWORD", None)
for _ in range(60):
    if subprocess.run(["docker", "exec", source, "pg_isready", "-U", "uvanoo_dev", "-d", "beaconhs"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0: break
    time.sleep(1)

def sql(container, statement, user="uvanoo_dev"):
    return r.run(["docker", "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
                  "-v", "ON_ERROR_STOP=1", "-U", user, "-d", "beaconhs"],
                 input=statement.encode()).decode().strip()

roles = (Path(__file__).parent/"bootstrap-restore.sql").read_text()
sql(source, roles)
fixture = """
CREATE EXTENSION pgcrypto;
CREATE EXTENSION pg_trgm;
ALTER SCHEMA public OWNER TO beaconhs_owner;
SET ROLE beaconhs_owner;
CREATE SCHEMA drizzle;
CREATE SCHEMA etl;
CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint NOT NULL);
INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(repeat('a',64),1700000000000);
CREATE TABLE public.properties(id integer PRIMARY KEY,tenant_id integer NOT NULL,label text NOT NULL);
INSERT INTO public.properties SELECT n,CASE WHEN n<4 THEN 1 ELSE 2 END,'Synthetic property '||n FROM generate_series(1,5)n;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.properties USING(tenant_id=current_setting('app.tenant_id',true)::int);
RESET ROLE;
INSERT INTO public.properties VALUES(99,3,'must remain isolated');
SET ROLE beaconhs_owner;
CREATE TABLE public.lifecycle_events(id bigserial PRIMARY KEY,property_id integer REFERENCES public.properties(id),payload text NOT NULL);
RESET ROLE;
INSERT INTO public.lifecycle_events(property_id,payload) SELECT 1,'synthetic-event-'||n FROM generate_series(1,968)n;
SET ROLE beaconhs_owner;
CREATE FUNCTION public.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'append only'; END$$;
CREATE TRIGGER protect_events BEFORE UPDATE OR DELETE ON public.lifecycle_events FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();
CREATE TYPE public.review_status AS ENUM ('draft','approved');
CREATE DOMAIN public.positive_value AS integer CHECK(VALUE>0);
CREATE VIEW public.event_counts AS SELECT property_id,count(*) n FROM public.lifecycle_events GROUP BY property_id;
GRANT USAGE ON SCHEMA public,drizzle,etl TO beaconhs_app,beaconhs_super,beaconhs_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public,drizzle,etl TO beaconhs_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public,drizzle,etl TO beaconhs_backup;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO beaconhs_app,beaconhs_super;
GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO beaconhs_app,beaconhs_super;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO beaconhs_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO beaconhs_backup;
RESET ROLE;
"""
# FORCE RLS blocks owner inserts without tenant context. Seed only this synthetic fixture as bootstrap.
fixture = fixture.replace("INSERT INTO public.properties SELECT", "RESET ROLE;\nINSERT INTO public.properties SELECT")
fixture = fixture.replace("ALTER TABLE public.properties ENABLE", "SET ROLE beaconhs_owner;\nALTER TABLE public.properties ENABLE")
sql(source, fixture)
roles_file = root/"roles.sql"
r.write_new(roles_file, roles.encode())
collector = repo/"docs/v1.4/drift-resolution58-validation/export-metadata.sql"
private_collector = root/"collector.sql"
r.write_new(private_collector, collector.read_bytes())
identity = root/"identity"
r.run(["age-keygen", "-o", str(identity)])
recipient = root/"recipient"
r.write_new(recipient, r.run(["age-keygen", "-y", str(identity)]))

# PG16.15 tools execute in the pinned synthetic container. Private files stay on
# the ephemeral runner. No TCP access or production credentials are available.
bin_dir = root/"bin"
bin_dir.mkdir(mode=0o700)
wrapper = r'''#!/usr/bin/env python3
import os,sys,subprocess
tool=os.path.basename(sys.argv[0]); args=sys.argv[1:]
container=os.environ["SYNTHETIC_PG_CONTAINER"]
input_data=None; output_file=None
if tool=="pg_dump":
 if "--version" not in args:
  i=args.index("--file"); output_file=args[i+1];del args[i:i+2]
  args+=["-U",os.environ["PGUSER"],"-d",os.environ["PGDATABASE"]]
elif tool=="psql":
 if "-f" in args:
  i=args.index("-f");input_data=open(args[i+1],"rb").read();del args[i:i+2]
 else: input_data=sys.stdin.buffer.read()
 args+=["-U",os.environ["PGUSER"],"-d",os.environ["PGDATABASE"]]
elif tool=="pg_restore" and "--list" in args:
 input_data=open(args[-1],"rb").read();args=args[:-1]
cmd=["docker","exec","-i"]
if "PGOPTIONS" in os.environ: cmd+=["-e","PGOPTIONS="+os.environ["PGOPTIONS"]]
cmd+=[container,tool]+args
p=subprocess.run(cmd,input=input_data,capture_output=True)
if p.returncode: sys.exit(p.returncode)
if output_file:
 with open(output_file,"xb") as f:f.write(p.stdout)
 os.chmod(output_file,0o600)
else: sys.stdout.buffer.write(p.stdout)
'''
for name in ("psql", "pg_dump", "pg_restore"):
    p = bin_dir/name
    r.write_new(p, wrapper.encode())
    os.chmod(p, 0o700)
os.environ.update(PATH=str(bin_dir)+":"+os.environ["PATH"], SYNTHETIC_PG_CONTAINER=source,
                  PGHOST="disposable-source", PGPORT="5432", PGDATABASE="beaconhs", PGUSER="beaconhs_backup")
guard = root/"guard"
# This verifies an isolated synthetic container, NOT a substitute live DEV fence.
r.write_new(guard, ("#!/bin/sh\nset -eu\n"
    "test \"$(docker inspect --format '{{.HostConfig.NetworkMode}}' "+source+")\" = none\n").encode())
os.chmod(guard, 0o700)
ctx = {"sourceSha":os.environ["GITHUB_SHA"], "sourceTree":r.run(["git","rev-parse","HEAD^{tree}"]).decode().strip(),
       "imageDigest":restore.IMAGE.split("@")[1], "database":"beaconhs",
       "databaseOid":int(sql(source,"SELECT oid FROM pg_database WHERE datname='beaconhs'")),
       "postgresVersion":"160015", "ledgerHash":"a"*64, "schemaHash":"b"*64, "dataHash":"c"*64,
       "recipientSha256":hashlib.sha256(recipient.read_text().strip().encode()).hexdigest(),
       "custodyReceiptSha256":"d"*64,"offHostReceiptSha256":"e"*64,
       "fenceGuardSha256":r.sha(guard),"metadataSqlSha256":r.sha(private_collector)}
# Fixture hashes are explicit synthetic contract inputs, not release evidence.
items = r.capture_pg(root, recipient, ctx, guard, private_collector)
for kind in ("storage","redis","clean155"):
    plain = root/(kind+".fixture")
    r.write_new(plain, ("synthetic recovery bytes: "+kind).encode())
    item = r.encrypt(plain, recipient, root/(kind+".age"))
    items.append(dict(item,kind=kind))
sealed = r.finalize(root,ctx,items)
try:
    result = restore.restore(root,sealed["sha256"],identity,root,roles_file,r.sha(roles_file))
except r.Rejected:
    # Only this hard-coded synthetic fixture may expose PG diagnostics.
    operation = json.loads((root/(".restore-"+sealed["sha256"]+".lock")/"started.json").read_text())
    log = Path(operation["workDirectory"])/"restore-errors.private.log"
    if log.exists():
        print("SYNTHETIC_ONLY_RESTORE_DIAGNOSTIC")
        print(log.read_text()[:4000])
    raise
target = result["container"]
before = r.parse_documents(sql(source,collector.read_text(),"beaconhs_backup"))
after = r.parse_documents(sql(target,collector.read_text(),"beaconhs_backup"))
require(len(before)==len(after)==21,"COLLECTOR_DOCUMENT_COUNT")
# Database OIDs and collection times differ by design; compare ledger and all19 sections.
for a,b in zip(before[1:],after[1:]):
    require(a["section"]==b["section"],"SECTION_ORDER")
    normalize=lambda rows:sorted(json.dumps(x,sort_keys=True,separators=(",",":")) for x in rows)
    require(normalize(a["rows"])==normalize(b["rows"]),"SECTION_RESTORE_MISMATCH_"+str(a["section"]))
for statement in (
    "SELECT count(*) FROM properties",
    "SELECT count(*) FROM lifecycle_events",
    "SELECT md5(string_agg(row_to_json(x)::text,'' ORDER BY id)) FROM properties x",
    "SELECT md5(string_agg(row_to_json(x)::text,'' ORDER BY id)) FROM lifecycle_events x",
    "SELECT last_value,is_called FROM lifecycle_events_id_seq",
):
    require(sql(source,statement)==sql(target,statement),"DATA_OR_SEQUENCE_MISMATCH")
require(sql(target,"SET app.tenant_id='1'; SELECT count(*) FROM properties","beaconhs_app")=="3","TENANT_ONE_ISOLATION")
require(sql(target,"SET app.tenant_id='2'; SELECT count(*) FROM properties","beaconhs_app")=="2","TENANT_TWO_ISOLATION")
for query in ("DELETE FROM lifecycle_events WHERE id=1",
              "INSERT INTO properties VALUES(100,2,'cross tenant')"):
    try:
        sql(target,"SET app.tenant_id='1'; "+query,"beaconhs_app")
    except r.Rejected: pass
    else: raise r.Rejected("SECURITY_DENIAL_FAILED")
require(sql(target,"SELECT count(*) FROM lifecycle_events")=="968","AUDIT_MUTATED")
for kind in ("storage","redis","clean155"):
    out = root/(kind+".restored")
    r.decrypt_component(root,sealed["sha256"],kind,identity,out)
    require(out.read_bytes()==(root/(kind+".fixture")).read_bytes(),"COMPONENT_RESTORE_MISMATCH")
print(json.dumps({"syntheticOnly":True,"postgresVersion":"16.15","postgresImage":restore.IMAGE,
 "archiveCaptureAndRestore":"PASS","metadataDocuments":21,"schemaSecuritySectionsMatched":19,
 "ledgerMatched":True,"ledgerFixtureEntries":1,"dataAndSequenceEquality":"PASS","tenantIsolation":"PASS",
 "appendOnlyTrigger":"PASS","storageRedisClean155ByteRoundTrips":"PASS",
 "liveDataOrCanonical58Rehearsal":False,"gateReleaseEvidenceProduced":False}))
