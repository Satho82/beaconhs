#!/usr/bin/env python3
"""Consume fresh web admission before ending maintenance monitoring and activating web."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
import time
import base64

def handoff(io):
    io.admit()
    try:
        io.record("admission-passed")
        io.stop_watchdog()
        io.stop_monitor()
        io.record("maintenance-monitoring-ended")
        io.activate_web()
        io.record("web-activated-public-fence-retained")
    except Exception:
        try:
            io.fence()
            io.record("activation-failed-writers-refenced")
        except Exception:
            io.record("activation-failed-fence-unconfirmed")
        raise

class Live:
    def __init__(self):
        self.root=Path(__file__).resolve().parents[3]
        self.source=os.environ.get("DEPLOY_SOURCE_SHA","")
        self.evidence=os.environ.get("DEV_RELEASE_EVIDENCE_SHA256","")
        self.approval=os.environ.get("DEV_TEMPORARY_APPROVAL_SHA256","")
        self.image=os.environ.get("IMAGE_DIGEST","")
        self.consumedSafetySha256=None
        self.admissionConsumedAt=None
        assert re.fullmatch(r"[a-f0-9]{40}",self.source)
        assert re.fullmatch(r"[a-f0-9]{64}",self.evidence) and re.fullmatch(r"[a-f0-9]{64}",self.approval)
        assert re.fullmatch(r"sha256:[a-f0-9]{64}",self.image)
        assert os.environ.get("DEV_SERVICE_AUTHORIZATION")=="restore-web"
        self.directory=Path("/opt/uvanoo-dev/release-evidence")/self.source
        assert self.directory.resolve()==self.directory and self.directory.is_dir()
        st=self.directory.stat()
        assert st.st_uid==os.getuid() and st.st_mode & 0o077==0
        assert hashlib.sha256((self.directory/"manifest.json").read_bytes()).hexdigest()==self.evidence
        assert self.call(["git","-C",str(self.root),"rev-parse","HEAD"]).decode().strip()==self.source
        self.receipt=self.directory/("activation-handoff-"+uuid.uuid4().hex+".jsonl")
        self.fd=os.open(self.receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    def call(self,args,timeout=600):
        result=subprocess.run(args,cwd=self.root,capture_output=True,timeout=timeout)
        if result.returncode:raise RuntimeError("DEV_ACTIVATION_COMMAND_REJECTED")
        return result.stdout
    def record(self,status):
        data={"observedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"status":status,
            "sourceSha":self.source,"imageDigest":self.image,"releaseEvidenceSha256":self.evidence,
            "ownerApprovalSha256":self.approval,"consumedSafetySha256":self.consumedSafetySha256,"admissionConsumedAt":self.admissionConsumedAt,"publicEditingFenceRemoved":False}
        os.write(self.fd,(json.dumps(data,separators=(",",":"))+"\n").encode());os.fsync(self.fd)
    def admit(self):
        self.call(["systemctl","is-active","--quiet","uvanoo-dev-recovery-watchdog.service"],10)
        self.call(["systemctl","is-active","--quiet","uvanoo-dev-release-monitor.service"],10)
        output=self.call(["bash",str(self.root/"scripts/cluster/verify-dev-release-admission.sh"),"web"])
        rows=[json.loads(line) for line in output.splitlines() if line.startswith(b'{"devAdmission"')]
        assert len(rows)==1 and rows[0]["devAdmission"]=="PASS" and rows[0]["sourceSha"]==self.source
        assert rows[0]["evidenceSha256"]==self.evidence and rows[0]["temporaryApprovalSha256"]==self.approval
        safety=base64.b64decode(rows[0]["consumedSafetyBase64"],validate=True)
        self.consumedSafetySha256=hashlib.sha256(safety).hexdigest()
        assert self.consumedSafetySha256==rows[0]["consumedSafetySha256"]
        self.admissionConsumedAt=rows[0]["consumedAt"]
        age=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(self.admissionConsumedAt.replace("Z","+00:00"))).total_seconds()
        assert 0<=age<10
        os.environ["DEV_ADMISSION_CONSUMED_AT"]=self.admissionConsumedAt
        self.deadline=time.monotonic()+(10-age)
        path=self.directory/("consumed-safety-"+self.consumedSafetySha256+".json")
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as out:out.write(safety);out.flush();os.fsync(out.fileno())
    def stop_unit(self,name):
        assert time.monotonic()<self.deadline
        self.call(["systemctl","stop",name],5)
        state=self.call(["systemctl","show",name,"-p","ActiveState","--value"],10).strip()
        assert state in [b"inactive",b"failed"]
    def stop_watchdog(self):self.stop_unit("uvanoo-dev-recovery-watchdog.service")
    def stop_monitor(self):
        self.stop_unit("uvanoo-dev-release-monitor.service")
        assert not (self.directory/"safety.json").exists()
        for name in ["monitor-stopped.json","monitor.lock"]:
            path=self.directory/name;st=path.lstat()
            assert path.resolve()==path and path.is_file() and st.st_uid==os.getuid() and st.st_mode & 0o077==0
        assert json.loads((self.directory/"monitor-stopped.json").read_text())=={"version":1,"status":"STOPPED"}
    def activate_web(self):
        assert time.monotonic()<self.deadline
        self.call(["node",str(self.root/"scripts/cluster/dev-writer-fence.mjs"),"restore-web"])
    def fence(self):
        self.call(["node",str(self.root/"scripts/cluster/dev-writer-fence.mjs"),"fence"])
        self.call(["node",str(self.root/"scripts/cluster/dev-writer-fence.mjs"),"verify-zero"])

if __name__=="__main__":
    try:
        live=Live()
        try:handoff(live)
        finally:os.close(live.fd)
    except Exception:
        print("DEV_ACTIVATION_HANDOFF_FAILED_CHECK_PRIVATE_RECEIPT",file=sys.stderr)
        sys.exit(1)
