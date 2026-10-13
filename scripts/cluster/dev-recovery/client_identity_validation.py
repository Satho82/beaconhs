#!/usr/bin/env python3
"""Hosted disposable reproduction only; not a live capture adapter."""
import json, os, secrets, tempfile, time
from pathlib import Path
import dev_recovery as r
import pg16_client
import restore_disposable
import backup_controller as c
r.require(os.environ.get("GITHUB_ACTIONS") == "true", "HOSTED_ONLY")
source="postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94"
r.run(["docker","pull",source])
name="uvanoo-client-mismatch-fixture"
os.environ["POSTGRES_PASSWORD"]=secrets.token_urlsafe(32)
try:
    r.run(["docker","run","-d","--network","none","--name",name,
           "-e","POSTGRES_PASSWORD",source])
finally:
    os.environ.pop("POSTGRES_PASSWORD",None)
for _ in range(30):
    try:
        version=r.run(["docker","exec",name,"postgres","--version"]).decode()
        if "16.15" in version: break
    except r.Rejected: pass
    time.sleep(1)
else: raise r.Rejected("FIXTURE_VERSION_REQUIRED")
server=json.loads(r.run(["docker","inspect",name]))[0]
client=json.loads(r.run(["docker","image","inspect",restore_disposable.IMAGE]))[0]
r.require(server["Image"] != client["Id"],"DISTINCT_IMAGE_REQUIRED")
c.PG=name
work=Path(tempfile.mkdtemp());os.chmod(work,0o700)
c.client_setup(work)
# Old server=restore-image assumption is demonstrably false. The new client profile
# is independently immutable and version checked; no alternate-image fallback.
c.verify_pg_client()
r.require(r.run(["pg_dump","--version"]).decode().split()[2] == "16.15",
          "CLIENT_VERSION_REQUIRED")
print("PG16_15_CLIENT_PROFILE_VERIFIED_INDEPENDENT_OF_RESTORE_IMAGE")
print("NO_FENCE_OR_CAPTURE_EXECUTED_IN_IDENTITY_FIXTURE")
