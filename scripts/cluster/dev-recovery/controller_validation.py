#!/usr/bin/env python3
"""Full capture controller fixture on a disposable GitHub-hosted Docker daemon only."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import dev_recovery as r
import backup_controller as controller
import backup_fence as fence
import recovery_components as components
import restore_disposable as restore
import isolated_rehearsal as isolated
import pg16_client

r.require(os.environ.get("GITHUB_ACTIONS") == "true" and os.geteuid() == 0, "HOSTED_ROOT_FIXTURE_ONLY")
os.umask(0o077)
here = Path(__file__).resolve().parent
os.environ.update(GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="safe.directory",
                  GIT_CONFIG_VALUE_0=str(controller.ROOT))
# Reuse just the existing fixture preparation, without repeating its completed tests.
fixture_path = here/"disposable_validation.py"
fixture = fixture_path.read_text().split("items = r.capture_pg(",1)[0]
r.run(["docker","pull","postgres@"+pg16_client.SERVER_IMAGE])
fixture = fixture.replace('"-e", "POSTGRES_DB=beaconhs", "-e", "POSTGRES_PASSWORD", restore.IMAGE]',
                          '"-e", "POSTGRES_DB=beaconhs", "-e", "POSTGRES_PASSWORD", "postgres@"+__import__("pg16_client").SERVER_IMAGE]')
ns={"__file__":str(fixture_path),"__name__":"fixture_setup"}
exec(compile(fixture,str(fixture_path),"exec"),ns)
source=ns["source"]
source_id=json.loads(r.run(["docker","inspect",source]))[0]["Image"]
client_id=json.loads(r.run(["docker","image","inspect",restore.IMAGE]))[0]["Id"]
r.require(source_id != client_id, "DISTINCT_SERVER_CLIENT_FIXTURE_REQUIRED")
print("DISTINCT_SERVER_AND_PINNED_CLIENT_IMAGES_VERIFIED")
r.run(["docker","rename",source,controller.PG])
sql=lambda statement: ns["sql"](controller.PG,statement)
journal=json.loads((controller.ROOT/"packages/db/drizzle/meta/_journal.json").read_text())["entries"]
values=[]
for entry in journal[:58]:
    h=r.sha(controller.ROOT/"packages/db/drizzle"/(entry["tag"]+".sql"))
    values.append("('"+h+"',"+str(entry["when"])+")")
# Deliberately SYNTHETIC ledger identities, not a canonical schema reconstruction.
sql("TRUNCATE drizzle.__drizzle_migrations RESTART IDENTITY; INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES "+",".join(values)+";")
r.run(["docker","swarm","init","--advertise-addr","127.0.0.1"])
for role in fence.REPEATING+fence.ONESHOT:
    command=["true"] if role in fence.ONESHOT else ["sleep","900"]
    r.run(["docker","service","create","--detach","--name",fence.STACK+"_"+role,
           "--label","com.docker.stack.namespace="+fence.STACK,
           "--restart-condition","none",restore.IMAGE]+command)
r.run(["docker","service","create","--detach","--name","unrelated-fixture",
       "--restart-condition","none",restore.IMAGE,"sleep","900"])
for _ in range(60):
    api=fence.Docker()
    try:
        selected=fence.select(api.services())
        fence.no_tasks(api,[selected[x] for x in fence.ONESHOT])
        if all(any(t["Status"]["State"]=="running" for t in api.tasks(selected[x]))
               for x in fence.REPEATING): break
    except r.Rejected: pass
    time.sleep(1)
else: raise r.Rejected("FIXTURE_SWARM_NOT_READY")
r.run(["docker","pull","redis:7.4"])
redis_image=json.loads(r.run(["docker","image","inspect","redis:7.4"]))[0]["Id"]
r.run(["docker","run","-d","--name",controller.REDIS,"--network","none",
       "--label","uvanoo.recovery=synthetic-test",redis_image])
for _ in range(30):
    try:
        if json.loads(components.redis_query(controller.REDIS,"PING"))=="PONG": break
    except Exception: pass
    time.sleep(1)
else: raise r.Rejected("FIXTURE_REDIS_NOT_READY")
components.redis_query(controller.REDIS,"SET","synthetic:queue","preserve")
for name in (components.MINIO,)+components.VOLUMES:
    r.run(["docker","volume","create",name])
    r.run(["docker","run","--rm","--network","none","--mount","type=volume,src="+name+",dst=/fixture",
           restore.IMAGE,"sh","-c","printf synthetic-recovery-bytes > /fixture/object"])
copy=Path("/var/lib/uvanoo-recovery/decision155-copy")
copy.mkdir(parents=True)
(copy/"fixture").write_text("synthetic inspection copy")
work=Path(tempfile.mkdtemp(prefix="full-controller-fixture-"))
os.chmod(work,0o700)
identity=work/"identity";recipient=work/"recipient"
r.run(["age-keygen","-o",str(identity)])
r.write_new(recipient,r.run(["age-keygen","-y",str(identity)]))
# Test-only injection of synthetic provenance. Never exported as release evidence.
controller.RECIPIENT=hashlib.sha256(recipient.read_text().strip().encode()).hexdigest()
controller.identity=lambda _:dict(sourceSha=os.environ["GITHUB_SHA"],
    sourceTree=r.run(["git","rev-parse","HEAD^{tree}"]).decode().strip(),
    imageDigest=restore.IMAGE.split("@")[1])
window=dict(operator="SYNTHETIC_HOSTED_FIXTURE",
    expiresAt=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=15)).isoformat(),
    noConcurrentDeployers=True,externalWritersExcluded=True,
    collaboraSessionsDrained=True,restoreOriginalRestartingWriters=True)
r.write_new(work/"window",r.canonical(window))
# Synthetic-only transport diagnostic; no production credentials or metadata.
import subprocess
cmd=pg16_client.command("psql",["-X","-q","-A","-t","-U","beaconhs_backup",
    "-d","beaconhs","-h","/var/run/postgresql","-c","SHOW server_version_num;"],
    controller.PG,"beaconhs_backup","beaconhs","")
transport=subprocess.run(cmd,capture_output=True,text=True)
print("SYNTHETIC_SOCKET_TRANSPORT",transport.returncode,transport.stdout.strip(),transport.stderr.strip())
r.require(transport.returncode == 0,"SYNTHETIC_SOCKET_TRANSPORT_FAILED")
sealed=controller.capture(work,work/"window")
manifest=r.verify(work,sealed["sha256"])
r.require(len(manifest["components"])==5,"FIVE_COMPONENTS_REQUIRED")
controller.transfer(work,sealed["sha256"],work/"transfer")
r.require(json.loads(components.redis_query(controller.REDIS,"GET","synthetic:queue"))=="preserve",
          "QUEUE_CHANGED")
print("FULL_CONTROLLER_CAPTURE_FENCE_MONITOR_COMPONENTS_CLOSURE_PASS")
# Explicit synthetic receipt exercises the custody boundary, not actual off-host evidence.
components.custody(work,sealed["sha256"],dict(manifestSha256=sealed["sha256"],
    location="owner-independent-Mac",verifiedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
    allChecksumsMatch=True,independentHost=True,attestedBy="SYNTHETIC_TEST_ONLY_NOT_REAL_CUSTODY"))
roles=work/"roles.sql"
r.write_new(roles,(here/"bootstrap-restore.sql").read_bytes())
receipt=restore.restore(work,sealed["sha256"],identity,work,roles,r.sha(roles))
result=isolated.verify58(work,sealed["sha256"],receipt)
r.require(result["verified"] is True,"RESTORE_COMPARISON")
print("FULL_CONTROLLER_58_LEDGER_SYNTHETIC_SCHEMA_DATA_RESTORE_PASS")
print("NO_CANONICAL58_OR_REAL_DATA_OR_OFFHOST_CUSTODY_CLAIM")
