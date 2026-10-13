#!/usr/bin/env python3
"""Hosted disposable reproduction only; not a live capture adapter."""
import json, os, secrets, tempfile, time
from pathlib import Path
import dev_recovery as r
import pg16_client
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
client=json.loads(r.run(["docker","image","inspect",pg16_client.IMAGE]))[0]
r.require(server["Image"] != client["Id"],"DISTINCT_IMAGE_REQUIRED")
c.PG=name
work=Path(tempfile.mkdtemp());os.chmod(work,0o700)
c.client_setup(work)
try:
    r.run(["pg_dump","--version"])
except r.Rejected as e:
    r.require(str(e)=="TOOL_EXIT_FAILED","WRAPPER_REPRODUCTION")
else: raise r.Rejected("EXPECTED_OLD_FAILURE")
try:
    c.verify_pg_client()
except r.Rejected as e:
    r.require(str(e)=="PINNED_PG_IMAGE_REQUIRED","SPECIFIC_REJECTION_REQUIRED")
else: raise r.Rejected("EXPECTED_PREFLIGHT_REJECTION")
print("PG16_15_DISTINCT_IMAGES_OLD_TOOL_EXIT_FAILED_REPRODUCED")
print("DIRECT_PREFLIGHT_PINNED_PG_IMAGE_REQUIRED_PASS")
print("NO_FENCE_OR_CAPTURE_EXECUTED")
