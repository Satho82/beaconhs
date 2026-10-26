#!/usr/bin/env python3
"""Hosted-runner-only adapter validation. No DEV endpoints or credentials."""
import json
import os
from pathlib import Path
import runpy
import shlex
import tempfile
import time
import unittest
import dev_recovery as r
import backup_fence as f
import recovery_components as components
from restore_disposable import IMAGE

r.require(os.environ.get("GITHUB_ACTIONS") == "true", "HOSTED_DISPOSABLE_ONLY")
os.umask(0o077)
here = Path(__file__).parent
if os.environ.get("ADAPTER_PHASE", "all") == "all":
    # Reuse the successful fixture; substitute only the new pinned-client bridge.
    capture = r.capture_pg
    def adapter_capture(*args, **kwargs):
        os.environ["UVANOO_PG_CONTAINER"] = os.environ["SYNTHETIC_PG_CONTAINER"]
        bindir = Path(os.environ["PATH"].split(":")[0])
        for name in ("psql", "pg_dump", "pg_restore"):
            text = "#!/bin/sh\nexec python3 "+shlex.quote(str(here/"pg16_client.py"))+" "+name+' "$@"\n'
            (bindir/name).write_text(text)
            os.chmod(bindir/name, 0o700)
        return capture(*args, **kwargs)
    r.capture_pg = adapter_capture
    runpy.run_path(str(here/"disposable_validation.py"), run_name="adapter_reused_fixture")
    print("PINNED_PG_CLIENT_ENCRYPTED_RESTORE_PASS")
    
    # Real Swarm API/CAS fixture uses only a hosted ephemeral daemon.
    r.run(["docker","swarm","init","--advertise-addr","127.0.0.1"])
    for role in f.REPEATING+f.ONESHOT:
        command = ["true"] if role in f.ONESHOT else ["sleep","600"]
        r.run(["docker","service","create","--detach","--name",f.STACK+"_"+role,
               "--label","com.docker.stack.namespace="+f.STACK,
               "--restart-condition","none",IMAGE]+command)
    api=f.Docker()
    for _ in range(60):
        values=api.services()
        try:
            selected=f.select(values)
            f.no_tasks(api,[selected[x] for x in f.ONESHOT])
            if all(any(t["Status"]["State"]=="running" for t in api.tasks(selected[x]))
                   for x in f.REPEATING): break
        except r.Rejected: pass
        time.sleep(1)
    else: raise r.Rejected("DISPOSABLE_SWARM_NOT_READY")
    import datetime as dt
    receipt=dict(operator="GitHub-hosted-synthetic-fixture",
                 expiresAt=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=10)).isoformat(),
                 noConcurrentDeployers=True,externalWritersExcluded=True,
                 collaboraSessionsDrained=True,restoreOriginalRestartingWriters=True)
    events=[]
    fence=f.Fence(api,api.services(),receipt,lambda name,data:events.append(name))
    fence.acquire(lambda _:None)
    fence.restore(lambda _:None)
    r.require(all("scheduler" not in e and "storage-init" not in e for e in events),
              "ONESHOT_MUTATION")
    print("REAL_SWARM_CAS_FENCE_RESTORE_PASS")
    
    
# The runner's Redis image is resolved to an immutable local content ID before use.
r.run(["docker","pull","redis:7.4"])
redis_image=json.loads(r.run(["docker","image","inspect","redis:7.4"]))[0]["Id"]
r.run(["docker","run","-d","--name","uvanoo-dev-redis","--network","none",
       "--label","uvanoo.recovery=synthetic-test",redis_image])
for _ in range(30):
    try:
        if json.loads(components.redis_query("uvanoo-dev-redis","PING"))=="PONG": break
    except Exception: pass
    time.sleep(1)
else: raise r.Rejected("SYNTHETIC_REDIS_NOT_READY")
components.redis_query("uvanoo-dev-redis","SET","synthetic:queue","do-not-replay")
work=Path(tempfile.mkdtemp(prefix="adapter-component-fixture-"))
os.chmod(work,0o700)
identity=work/"key";recipient=work/"recipient"
r.run(["age-keygen","-o",str(identity)])
r.write_new(recipient,r.run(["age-keygen","-y",str(identity)]))
item=components.capture_redis("uvanoo-dev-redis",work,recipient,lambda:None)
r.require(item["kind"]=="redis" and r.sha(work/item["file"])==item["sha256"],"REDIS_ENCRYPTION")
r.require(json.loads(components.redis_query("uvanoo-dev-redis","GET","synthetic:queue"))==
          "do-not-replay","QUEUE_MUTATED")
print("REDIS_RDB_CRC_ENCRYPTED_CAPTURE_PASS")
print("ADAPTER_FIXTURES_PASS_NO_LIVE_EVIDENCE")
