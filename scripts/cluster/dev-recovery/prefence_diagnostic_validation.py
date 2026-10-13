import json, os, subprocess, uuid
import diagnose_prefence as d
import dev_recovery as r
from restore_disposable import IMAGE
r.require(os.environ.get("GITHUB_ACTIONS")=="true","HOSTED_ONLY")
name="prefence-disposable-"+uuid.uuid4().hex
identifier=r.run(["docker","create","--name",name,IMAGE,"true"]).decode().strip()
# Emulate the bounded list/inspect race using only a newly created disposable fixture.
r.run(["docker","rm",identifier])
out,data=d.call("CONTAINER_INSPECT",["docker","inspect",identifier])
r.require(out["status"]=="EXIT_FAILED" and out["exitCode"]==1
          and out["errorClass"]=="MISSING_OBJECT" and data is None,
          "RACE_CLASSIFICATION_REQUIRED")
print(json.dumps(out))
print("DISPOSABLE_MISSING_OBJECT_DIAGNOSTIC_PASS; NOT_A_LIVE_ROOT_CAUSE_CLAIM")
