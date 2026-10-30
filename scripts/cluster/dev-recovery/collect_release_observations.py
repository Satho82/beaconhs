#!/usr/bin/env python3
"""Read-only DEV admission observations. Missing, stale or changed facts reject."""
import datetime as dt
import hashlib
import fcntl
from contextlib import contextmanager
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

STACK = "uvanoo-v1-4-dev-gniriv"
ROLES = ("web", "worker", "scheduler", "storage-init", "collabora")
TERMINAL = {"complete", "shutdown", "failed", "rejected", "remove"}
TARGET = {"repository":"Satho82/beaconhs","environment":"dev","composeId":"wYb0LxLQrvj2FPI21i-Oj","stack":STACK,"host":"dev.uvanoo.com","database":"uvanoo_dev","databaseHost":"uvanoo-dev-postgres","network":"uvanoo-dev-private"}

def require(value):
    if not value:
        raise ValueError("DEV_OBSERVATION_REJECTED")

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()

def digest(value):
    return hashlib.sha256(value).hexdigest()

def timestamp(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()

def private_json(path, expected=None):
    path = Path(path)
    st = path.lstat()
    require(path.is_absolute() and path.resolve() == path and path.is_file())
    require(st.st_uid == os.getuid() and st.st_mode & 0o077 == 0 and st.st_size < 4_000_000)
    raw = path.read_bytes()
    if expected is not None:
        require(digest(raw) == expected)
    return json.loads(raw)

def private_stream(path):
    path=Path(path)
    require(path.is_absolute() and path.resolve()==path)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as stream:
        st=os.fstat(stream.fileno())
        require(st.st_uid==os.getuid() and st.st_mode & 0o077==0 and st.st_size<=20_000_000)
        return stream.read(20_000_001)

def interval_config_identity(config):
    # Capture is appended after the snapshot; all observer inputs remain pinned.
    return digest(canonical({k:v for k,v in config.items() if k!="releaseCapture"}))

def execute(args, data=None):
    p = subprocess.run(args, input=data, capture_output=True, timeout=2,
                       env={"PATH":"/usr/local/bin:/usr/bin:/bin","LANG":"C.UTF-8"})
    require(p.returncode == 0 and len(p.stdout) < 4_000_000)
    return p.stdout

def docker_get(path):
    import http.client
    import socket
    class LocalDocker(http.client.HTTPConnection):
        def connect(self):
            self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
            self.sock.settimeout(1.5)
            self.sock.connect("/var/run/docker.sock")
    require(path.startswith(("/services","/tasks","/containers","/volumes")))
    connection=LocalDocker("localhost",timeout=1.5)
    try:
        connection.request("GET","/v1.45"+path)
        response=connection.getresponse();raw=response.read(4_000_001)
        require(response.status==200 and len(raw)<=4_000_000)
        return json.loads(raw)
    finally:connection.close()

def docker(args):
    from urllib.parse import quote
    if args[:2]==["service","inspect"]:
        return [docker_get("/services/"+quote(x,safe="")+"?insertDefaults=true") for x in args[2:]]
    if args[:2]==["volume","inspect"]:
        return [docker_get("/volumes/"+quote(x,safe="")) for x in args[2:]]
    if args[:1]==["inspect"]:
        return [docker_get("/containers/"+quote(x,safe="")+"/json") for x in args[1:]]
    raise ValueError("UNSUPPORTED_DOCKER_OBSERVATION")

def zero_state():
    from urllib.parse import quote
    services = docker(["service", "inspect", *[STACK+"_"+role for role in ROLES]])
    require(len(services) == 5 and {s["Spec"]["Name"] for s in services} == {STACK+"_"+r for r in ROLES})
    require(all(type(s["Spec"]["Mode"]["Replicated"]["Replicas"]) is int and
                s["Spec"]["Mode"]["Replicated"]["Replicas"] == 0 for s in services))
    tasks=docker_get("/tasks?filters="+quote(json.dumps({"service":[s["ID"] for s in services]}),safe=""))
    require(all(t["ServiceID"] in {s["ID"] for s in services} and t["Status"]["State"] in TERMINAL for t in tasks))
    return services, tasks

def validate_zero_baseline(services, tasks, baseline):
    require({s["Spec"]["Name"]:s["ID"] for s in services} == baseline["serviceIds"])
    # No silently admitted service-spec change or replacement task.
    require({s["ID"]:digest(canonical(s["Spec"])) for s in services} == baseline["serviceSpecHashes"])
    require(sorted(t["ID"] for t in tasks) == baseline["taskIds"])

def watch(config):
    state = Path("/opt/uvanoo-dev/recovery-watchdog")
    require(not (state/"latched.json").exists())
    properties = execute(["systemctl","show","uvanoo-dev-recovery-watchdog.service",
        "-p","FragmentPath","-p","DropInPaths","-p","ActiveState","-p","SubState","-p","Restart","-p","ExecStart"]).decode()
    values = dict(line.split("=",1) for line in properties.splitlines() if "=" in line)
    require(values["ActiveState"] == "active" and values["SubState"] == "running")
    require(values["Restart"] == "no" and values["DropInPaths"] == "")
    require(values["FragmentPath"] == "/etc/systemd/system/uvanoo-dev-recovery-watchdog.service")
    require("path=/opt/uvanoo-dev/recovery-watchdog/check.sh ;" in values["ExecStart"])
    expected_paths = {"/etc/systemd/system/uvanoo-dev-recovery-watchdog.service",
        "/opt/uvanoo-dev/recovery-watchdog/check.sh","/opt/uvanoo-dev/recovery-watchdog/check.py"}
    require(set(config["watchdogFiles"]) == expected_paths)
    for path, expected in config["watchdogFiles"].items():
        require(digest(Path(path).read_bytes()) == expected)
    review = private_json(config["watchdogReview"]["path"],config["watchdogReview"]["sha256"])
    rehearsal = private_json(config["watchdogRehearsal"]["path"],config["watchdogRehearsal"]["sha256"])
    require(review["result"] == "APPROVED_CONDITIONALLY" and review["finalReleaseApproved"] is False)
    require(review["reviewEvidenceSha256"] == config["watchdogRehearsal"]["sha256"])
    require(rehearsal["testsPassed"] == 8 and all(v == 0 for v in rehearsal["validationExitCodes"].values()))
    require(rehearsal["latchedInstalledLauncherExit"] == 1 and rehearsal["latchAndHeartbeatUnchanged"] is True)
    for key,path in [("unitSha256","/etc/systemd/system/uvanoo-dev-recovery-watchdog.service"),
                     ("launcherSha256","/opt/uvanoo-dev/recovery-watchdog/check.sh"),
                     ("checkerSha256","/opt/uvanoo-dev/recovery-watchdog/check.py")]:
        require(review[key] == rehearsal[key] == config["watchdogFiles"][path])
    failure = Path(config["watchdogFailureLog"])
    require(digest(failure.read_bytes()) == rehearsal["failureRehearsalSha256"])
    heartbeat_path=state/"heartbeat.json"
    st=heartbeat_path.lstat()
    require(st.st_uid == os.getuid() and st.st_mode & 0o077 == 0 and heartbeat_path.resolve() == heartbeat_path)
    raw=heartbeat_path.read_bytes();heartbeat=json.loads(raw)
    require(heartbeat["status"] == "OK" and heartbeat["stack"] == STACK)
    require(heartbeat["desiredReplicas"] == 0 and heartbeat["activeTasks"] == 0)
    require(0 <= time.time()-timestamp(heartbeat["observedAt"]) <= 10)
    require(not (state/"latched.json").exists())
    require(execute(["systemctl","is-active","uvanoo-dev-recovery-watchdog.service"]).strip() == b"active")
    return {"independent":True,"active":True,"heartbeatFresh":True,"latchClear":True,
        "failureRehearsalSha256":rehearsal["failureRehearsalSha256"],"heartbeatSha256":digest(raw)}

def legacy(config):
    baseline = config["legacyServices"]
    require(len(baseline) == 10 and len({x["id"] for x in baseline}) == 10)
    all_ids={x["ID"] for x in docker_get("/services")}
    require(all_ids == {x["id"] for x in baseline} | set(config["zeroBaseline"]["serviceIds"].values()))
    current = docker(["service","inspect", *[x["id"] for x in baseline]])
    observed = []
    for service in current:
        spec=service["Spec"]
        observed.append({"id":service["ID"],"version":service["Version"]["Index"],
            "name":spec["Name"],"image":spec["TaskTemplate"]["ContainerSpec"]["Image"],
            "mode":spec["Mode"],"networks":spec["TaskTemplate"].get("Networks",[]),
            "mounts":spec["TaskTemplate"]["ContainerSpec"].get("Mounts")})
    before=digest(canonical(sorted(baseline,key=lambda x:x["id"])))
    after=digest(canonical(sorted(observed,key=lambda x:x["id"])))
    require(before == after)
    return {"unchanged":True,"baselineSha256":before,"observedSha256":after}

def four_zero(config):
    services,tasks=zero_state()
    validate_zero_baseline(services,tasks,config["zeroBaseline"])
    four_ids={k:v for k,v in config["zeroBaseline"]["serviceIds"].items() if k != STACK+"_collabora"}
    four_specs={v:config["zeroBaseline"]["serviceSpecHashes"][v] for v in four_ids.values()}
    require(len(four_ids)==4)
    return {"exactFourServiceIdentities":True,"desiredReplicas":0,"activeTasks":0,
            "approvedServiceIdsSha256":digest(canonical(four_ids)),
            "approvedSpecTransitionSha256":digest(canonical(four_specs))}

def validate_stop_event(boundary,raw,bootstrap):
    events=[json.loads(line) for line in raw.splitlines() if line]
    dies=[e for e in events if e["Action"] == "die" and e["Actor"]["ID"] == boundary["containerId"]]
    require(len(dies) == 1 and dies[0]["Actor"]["Attributes"]["exitCode"] == boundary["exitCode"])
    attributes=dies[0]["Actor"]["Attributes"]
    require(attributes["com.docker.swarm.task.id"] == boundary["taskId"])
    require(abs(dies[0]["timeNano"]/1e9-timestamp(boundary["stoppedAt"])) < 0.000002)
    require(timestamp(boundary["stoppedAt"]) >= timestamp(bootstrap["stopRequestedAt"]))
    require(not any(e["Action"] == "oom" and e["Actor"]["ID"] == boundary["containerId"] for e in events))

def collabora(config):
    # Reuse the governed validator; never infer a historical interval from stopped tasks.
    sys.path.insert(0,str(Path(__file__).parent))
    require(digest(Path(__file__).with_name("observe_collabora_interval.py").read_bytes()) == config["intervalValidatorSha256"])
    from observe_collabora_interval import validate_samples
    interval=private_json(config["interval"]["path"],config["interval"]["sha256"])
    rebuilt=validate_samples(interval["samples"],config["sourceSha"],config["epoch"])
    require(canonical(rebuilt) == canonical(interval))
    stop=private_json(config["stopBoundary"]["path"],config["stopBoundary"]["sha256"])
    require(stop["status"] == "PASS" and stop["sourceSha"] == config["sourceSha"])
    require(stop["intervalSha256"] == config["interval"]["sha256"] and stop["epoch"] == config["epoch"])
    bootstrap=private_json(config["bootstrapReceipt"]["path"],config["bootstrapReceipt"]["sha256"])
    require(stop["bootstrapReceiptSha256"] == config["bootstrapReceipt"]["sha256"] == config["bootstrapReceiptSha256"])
    require(bootstrap["intervalCollectionSucceeded"] is True and bootstrap["sourceSha"] == config["sourceSha"])
    require(bootstrap["epoch"] == config["epoch"] and bootstrap["intervalSha256"] == config["interval"]["sha256"])
    require(stop["lastAuthenticatedObservation"] == bootstrap["lastAuthenticatedObservation"])
    last=stop["lastAuthenticatedObservation"]
    require(last["sourceSha"] == config["sourceSha"] and last["epoch"] == config["epoch"])
    require(last["completionWatermark"] == interval["completionWatermark"])
    require(all(last[k] == 0 for k in ["activeSessions","activeDocuments","inFlight","failedSaves","unknownOutcomes","eventCount"]))
    require(0 <= timestamp(bootstrap["stopRequestedAt"])-timestamp(last["observedAt"]) <= 3)
    require(stop["oldContinuityGapNotClaimed"] is True and stop["historicalSaveState"] == "UNKNOWN")
    boundaries=stop["actualStopBoundaries"]
    require(len(boundaries) == 2 and {b["role"] for b in boundaries} == {"web","collabora"})
    for boundary in boundaries:
        require(boundary["exitCode"] in ["0","143"])
        require(timestamp(interval["observationEndsAt"]) <= timestamp(boundary["stoppedAt"]))
        require(timestamp(boundary["stoppedAt"]) <= timestamp(stop["allFiveZeroObserved"]["observedAt"]))
        path=config["stopEventFiles"][boundary["role"]]
        raw=Path(path).read_bytes();require(digest(raw) == boundary["eventsSha256"])
        validate_stop_event(boundary,raw,bootstrap)
    raw=private_stream(config["continuationPath"])
    # Only complete persisted lines; a newly-being-written line is not an observation.
    complete=raw[:raw.rfind(b"\n")+1]
    samples=[json.loads(line) for line in complete.splitlines() if line]
    require(len(samples) >= 13)
    require(timestamp(samples[-1]["observedAt"])-timestamp(samples[0]["observedAt"]) >= 60)
    require(timestamp(samples[0]["observedAt"]) >= timestamp(stop["postStopVerifiedAt"]))
    require(0 <= time.time()-timestamp(samples[-1]["observedAt"]) <= 5)
    previous=None
    for sample in samples:
        require(sample["status"] == "OK" and sample["stack"] == STACK)
        require(sample["desiredReplicas"] == 0 and sample["activeTasks"] == 0 and sample["eventCount"] == 0)
        require(sample["completionWatermark"] == interval["completionWatermark"])
        if previous is not None:
            require(0 < timestamp(sample["observedAt"])-timestamp(previous["observedAt"]) <= 5)
        previous=sample
    services,tasks=zero_state()
    validate_zero_baseline(services,tasks,config["zeroBaseline"])
    pg=pg_observation(config)
    require(pg["wopiEvents"] == 0 and pg["stats"] == config["databaseWriteCounters"])
    require(stop["postStopLedger"]["eventCount"] == 0)
    require(stop["postStopLedger"]["completionWatermark"] == digest(b"[]") == interval["completionWatermark"])
    for path, expected in config["editingFenceHashes"].items():
        require(digest(Path(path).read_bytes()) == expected)
    require(len(config["editingFenceHashes"]) == 2)
    preservation=private_json(config["preservation"]["path"],config["preservation"]["sha256"])
    require(preservation["sourceOnlyInserted"] == 10370 and preservation["sharedConflictsResolved"] == 40)
    require(preservation["originalBeaconhsRetained"] is True and preservation["originalEncryptedBackupsRetained"] is True)
    return {"desiredReplicas":0,"activeTasks":0,"activeSessions":0,"pendingSaves":0,"failedSaves":0,
        "unknownOutcomes":0,"newActivityCoverageComplete":True,"editingBlocked":True,
        "historicalSaveStateUnknown":True,"knownUnsavedDocumentsPreserved":True,
        "intervalEvidenceSha256":config["interval"]["sha256"],
        "taskCoverageSha256":digest(canonical(boundaries)),
        "completionWatermark":interval["completionWatermark"],
        "bootstrapReceiptSha256":config["bootstrapReceiptSha256"],
        "approvalReceiptSha256":config["historicalApprovalReceiptSha256"],"epoch":config["epoch"]}


def verify_admission_client(client,config):
    require(client["application"]=="uvanoo-admission:"+config["sourceSha"])
    require(client["state"] in ["active","idle in transaction","idle"])
    gate=config["admissionObserver"]
    container=docker_get("/containers/uvanoo-dev-admission-"+config["sourceSha"][:12]+"-web/json")
    require(container["State"]["Running"] and container["Config"]["Image"]==gate["nodeImage"])
    labels=container["Config"]["Labels"]
    require(labels["uvanoo.dev.admission.source"]==config["sourceSha"] and labels["uvanoo.dev.admission.phase"]=="web")
    require(container["Config"]["Cmd"]==["pnpm","--filter","@beaconhs/db","exec","tsx","src/verify-dev-release-admission.ts"])
    host=container["HostConfig"]
    require(host["ReadonlyRootfs"] is True and host["Privileged"] is False and host["CapDrop"]==["ALL"] and host["CapAdd"] in [None,[]])
    require(container["Config"]["Entrypoint"]==["docker-entrypoint.sh"] and container["Config"]["WorkingDir"]=="/workspace")
    require("no-new-privileges" in host["SecurityOpt"] and host["PortBindings"] in [None,{}])
    networks=container["NetworkSettings"]["Networks"]
    require(set(networks)=={"uvanoo-dev-private"} and networks["uvanoo-dev-private"]["IPAddress"]==client["address"])
    mounts={x["Destination"]:x for x in container["Mounts"]}
    require(set(mounts)=={"/workspace","/pnpm-toolchain","/release-evidence"})
    require(set(gate["mounts"])=={"/workspace","/pnpm-toolchain","/release-evidence"})
    for destination,source in gate["mounts"].items():
        require(mounts[destination]["Source"]==source and mounts[destination]["RW"] is False)
    # Only the exact source-bound read-only verifier can use the backup-role exception.
    env=dict(x.split("=",1) for x in container["Config"]["Env"])
    require(env["DEPLOY_SOURCE_SHA"]==config["sourceSha"] and env["DEV_ADMISSION_PHASE"]=="web")
    require(labels["uvanoo.dev.admission.evidence"]==env["DEV_RELEASE_EVIDENCE_SHA256"])
    require(env["DEV_RELEASE_EVIDENCE_PATH"]=="/release-evidence/manifest.json")
    directory=Path("/opt/uvanoo-dev/release-evidence")/config["sourceSha"]
    require(gate["mounts"]["/release-evidence"]==str(directory))
    manifest_bytes=private_stream(directory/"manifest.json")
    manifest=json.loads(manifest_bytes)
    approval_bytes=private_stream(directory/"owner-approval.json")
    require(manifest["sourceSha"]==config["sourceSha"])
    require(env["DEV_RELEASE_EVIDENCE_SHA256"]==digest(manifest_bytes))
    require(env["DEV_TEMPORARY_APPROVAL_SHA256"]==digest(approval_bytes)==manifest["admission"]["approvalSha256"])
    require(env["IMAGE_DIGEST"]==manifest["imageDigest"])

def pg_observation(config=None):
    sql = """BEGIN READ ONLY; SET LOCAL statement_timeout=1000;
    SELECT json_build_object('oid',(SELECT oid::int FROM pg_database WHERE datname=current_database()),
      'clients',(SELECT coalesce(json_agg(json_build_object('query',query,'user',usename,'address',client_addr,'state',state,'application',application_name)),'[]'::json) FROM pg_stat_activity WHERE pid<>pg_backend_pid()
        AND backend_type='client backend' AND datname IN ('beaconhs','uvanoo_dev','uvanoo_dev_preconsolidation_20261030')),
      'stats',(SELECT json_agg(json_build_array(datid,datname,stats_reset,tup_inserted,tup_updated,tup_deleted) ORDER BY datname) FROM pg_stat_database WHERE datname IN ('beaconhs','uvanoo_dev','uvanoo_dev_preconsolidation_20261030')),
      'wopiEvents',(SELECT count(*) FROM audit_log WHERE entity_type='wopi_save_dev_v1')); ROLLBACK;"""
    result=json.loads(execute(["docker","exec","-i","uvanoo-dev-postgres","psql","-X","-qAt",
        "-U","uvanoo_dev","-d","uvanoo_dev","-v","ON_ERROR_STOP=1"],sql.encode()))
    sampler="BEGIN READ ONLY; SET LOCAL statement_timeout=1500; SELECT count(*) FROM audit_log WHERE entity_type='wopi_save_dev_v1'; ROLLBACK;"
    observer_queries={sql.strip(),sampler.strip()}
    for statement in [sql,sampler]:
        for part in statement.split(";"):
            if part.strip():
                observer_queries.add(part.strip()+";")
                observer_queries.add(part.strip())
    for client in result["clients"]:
        if config is not None and client["user"]=="uvanoo_dev" and client["address"] is None and client["application"]=="uvanoo-backup:"+config["sourceSha"]:
            container=docker_get("/containers/uvanoo-dev-postgres/json")
            require(container["Config"]["Image"]=="postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94")
            processes=docker_get("/containers/uvanoo-dev-postgres/top?ps_args=-eo%20pid,args")
            require(processes["Titles"]==["PID","COMMAND"])
            require(sum(row[1]=="pg_dump -U uvanoo_dev -d uvanoo_dev -Fc" for row in processes["Processes"])==1)
            continue
        if config is not None and client["user"]=="uvanoo_dev" and client["address"] is None and client["application"]=="uvanoo-verify:"+config["sourceSha"]:
            require(client["state"] in ["active","idle in transaction"])
            require(digest(client["query"].encode()) in config["approvedReadOnlySqlSha256"])
            continue
        if client["user"]=="beaconhs_backup" and config is not None:
            verify_admission_client(client,config)
            continue
        require(client["user"]=="uvanoo_dev" and client["address"] is None and client["state"] in ["active","idle in transaction"])
        require(client["query"].strip() in observer_queries)
    result["clients"]=0
    return result

@contextmanager
def redis_observation_lock():
    # Serialize our short-lived read-only Redis clients; never exempt other clients.
    path="/opt/uvanoo-dev/monitor-private/release-redis-observation.lock"
    fd=os.open(path,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        st=os.fstat(fd)
        require(st.st_uid == os.getuid() and st.st_mode & 0o077 == 0)
        deadline=time.monotonic()+1.5
        while True:
            try:
                fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
                break
            except BlockingIOError:
                require(time.monotonic()<deadline)
                time.sleep(0.01)
        yield
    finally:
        os.close(fd)

def redis_observation():
    # Credentials remain inside the already-authorized DEV container.
    command='export REDISCLI_AUTH="$DEV_REDIS_PASSWORD"; exec redis-cli --no-auth-warning --raw CLIENT LIST'
    with redis_observation_lock():
        text=execute(["docker","exec","uvanoo-dev-redis","sh","-c",command]).decode()
    clients=[dict(field.split("=",1) for field in line.split() if "=" in field) for line in text.splitlines()]
    require(len(clients) == 1 and clients[0]["cmd"] == "client|list")
    require(clients[0]["addr"].startswith("127.0.0.1:"))
    return {"unapprovedClients":0,"receiptSha256":digest(canonical(clients))}

def dokploy_observation(config):
    import urllib.request
    path=Path(config["dokployTokenPath"]);st=path.lstat()
    require(path.resolve() == path and st.st_uid == os.getuid() and st.st_mode & 0o077 == 0)
    request=urllib.request.Request("http://127.0.0.1:3000/api/compose.one?composeId="+TARGET["composeId"],
        headers={"x-api-key":path.read_text().strip()})
    with urllib.request.urlopen(request,timeout=1.5) as response:
        require(response.status == 200);value=json.load(response)
    require(value["composeId"] == TARGET["composeId"] and value["appName"] == STACK)
    require(value["autoDeploy"] is False and value["serverId"] is None)
    require(value["environmentId"] == "qT391QtcIqahNap5wPjif")
    require(digest(value["env"].encode()) == config["savedEnvSha256"])
    require(digest(value["composeFile"].encode()) == config["savedComposeSha256"])
    require(value["composeStatus"] == "done")
    require(all(d["status"] in ["done","error"] for d in value["deployments"]))
    require(value["deployments"] == config["approvedDeployments"])
    return {"queued":0,"unapproved":0}

def github_observation():
    def fetch(path):
        return json.loads(execute(["sudo","-H","-u","ubuntu","gh","api",path]))
    with ThreadPoolExecutor(max_workers=3) as pool:
        state=pool.submit(fetch,"repos/Satho82/beaconhs/actions/workflows/373396385")
        queued=pool.submit(fetch,"repos/Satho82/beaconhs/actions/workflows/373396385/runs?status=queued&per_page=1")
        running=pool.submit(fetch,"repos/Satho82/beaconhs/actions/workflows/373396385/runs?status=in_progress&per_page=1")
        state=state.result();queued=queued.result();running=running.result()
    require(state["id"] == 373396385 and state["state"] == "disabled_manually")
    require(queued["total_count"] == 0 and running["total_count"] == 0)
    return True

def parse_storage_metrics(body):
    import re
    require(body.endswith("\n"))
    require("# HELP minio_api_requests_total " in body and "# TYPE minio_api_requests_total counter" in body)
    # RELEASE.2025-09-07T16-13-09Z cmd/metrics-v3-types.go MetricValues.Set
    # emits only value>0. metrics-v3-api.go loads waiting and current request counts.
    # Missing current series means zero ONLY for the image pinned above and a
    # successful authenticated complete response from this exact collector.
    writes={};seen=set();total_series=0
    read_apis={"HeadObject","ListObjectsV1","ListObjectsV2","ListObjectVersions","GetBucketLocation"}
    for line in body.splitlines():
        if line.startswith("#") or not line.strip():continue
        match=re.fullmatch(r'(minio_api_requests_[a-z0-9_]+)(?:\{([^}]*)\})? ([0-9.eE+-]+)',line)
        if match is None:
            # Histogram + traffic metrics are not current/writer counters.
            require(not line.startswith(("minio_api_requests_inflight_total","minio_api_requests_waiting_total","minio_api_requests_total")))
            continue
        name,labels,raw=match.groups();value=float(raw)
        require((name,labels) not in seen);seen.add((name,labels))
        require(value>=0 and value<float("inf"))
        api=re.search(r'(?:^|,)name="([^"]+)"',labels or "")
        if name=="minio_api_requests_waiting_total":require(value==0)
        if name in ["minio_api_requests_inflight_total","minio_api_requests_total"]:
            require(api is not None and 'type="s3"' in (labels or ""))
            if name=="minio_api_requests_total":total_series+=1
            if api.group(1) not in read_apis:
                if name=="minio_api_requests_inflight_total":require(value==0)
                else:writes[api.group(1)]=value
    require(total_series>0)
    return writes

def storage_metrics(config):
    import re
    credential=private_json(config["minioMetricsConfig"])
    require(timestamp(credential["expiresAt"]) > time.time())
    container=docker(["inspect","uvanoo-dev-minio"])[0]
    require(container["Config"]["Image"] == config["minioImage"] == "minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e")
    require(container["State"]["Running"] and container["State"]["Health"]["Status"] == "healthy")
    require(container["State"]["StartedAt"] == config["minioStartedAt"])
    pid=container["State"]["Pid"]
    body=execute(["nsenter","-t",str(pid),"-n","curl","--disable","-sS","--fail","--max-time","1",
        "--config","-","http://127.0.0.1:9000/minio/metrics/v3/api/requests"],
        ('header = '+json.dumps('Authorization: Bearer '+credential["token"])+'\n').encode()).decode()
    writes=parse_storage_metrics(body)
    require(writes == config["minioWriteCounters"])
    return {"writers":0,"writeCounters":writes,"receiptSha256":digest(body.encode())}

def owner_hold(config):
    hold=private_json(config["hold"]["path"],config["hold"]["sha256"])
    require(hold["technicalExclusion"] is False and hold["privilegedOperatorRiskAccepted"] is True)
    require(hold["competingDevAdministrativeWritesPermitted"] is False)
    require(timestamp(hold["startsAt"]) <= time.time() < timestamp(hold["expiresAt"]))
    with ThreadPoolExecutor(max_workers=5) as pool:
        pg=pool.submit(pg_observation,config);redis=pool.submit(redis_observation)
        control=pool.submit(dokploy_observation,config);github=pool.submit(github_observation)
        storage=pool.submit(storage_metrics,config)
        pg=pg.result();redis.result();control.result();github.result();storage=storage.result()
    require(pg["clients"] == 0 and pg["oid"] == config["databaseOid"])
    require(pg["stats"] == config["databaseWriteCounters"] and pg["wopiEvents"] == config["wopiEventCount"])
    services,tasks=zero_state();validate_zero_baseline(services,tasks,config["zeroBaseline"])
    return {"technicalExclusion":False,"ownerHoldActive":True,"workflow373396385Disabled":True,
        "unapprovedDeployments":0,"queuedDeployments":0,"unexpectedSpecChanges":0,
        "unapprovedPostgresClients":0,"unapprovedRedisClients":0,"storageWriters":storage["writers"],
        "holdReceiptSha256":config["hold"]["sha256"],
        "allowedMigrationConnectionsSha256":digest(canonical([]))}



def storage_library(config):
    import importlib.util
    require(Path(config["objectLibrary"]) == Path(__file__).with_name("release_object_inventory.py"))
    require(digest(Path(config["objectLibrary"]).read_bytes()) == config["objectLibrarySha256"])
    spec=importlib.util.spec_from_file_location("dev_object_reference",config["objectLibrary"])
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    original=module.minio_get
    def request(suffix="",head=False):
        if not head:
            return original(suffix,head)
        from urllib.parse import urlsplit
        secret=private_json(config["appStorageCredential"])
        require(secret["target"] == "uvanoo-dev-minio/uvanoo-dev")
        require(suffix.startswith("/") and "?" not in suffix)
        pid=docker(["inspect","uvanoo-dev-minio"])[0]["State"]["Pid"]
        credential=secret["accessKey"]+":"+secret["secretKey"]
        return execute(["nsenter","-t",str(pid),"-n","curl","--disable","-sS","--fail",
            "--head","--max-time","1","--aws-sigv4","aws:amz:us-east-1:s3","--config","-",
            "http://127.0.0.1:9000/uvanoo-dev"+suffix],
            ("user = "+json.dumps(credential)+"\n").encode())
    module.minio_get=request
    original_queue=module.queue_inventory
    def queue_inventory():
        with redis_observation_lock():
            return original_queue()
    module.queue_inventory=queue_inventory
    return module

def current_storage(config, metadata=False):
    module=storage_library(config)
    with ThreadPoolExecutor(max_workers=3) as pool:
        objects=pool.submit(module.storage);versions=pool.submit(module.versions)
        queues=pool.submit(module.queue_inventory)
        objects=objects.result();versions=versions.result();queues=queues.result()
    baseline=private_json(config["storageBaseline"]["path"],config["storageBaseline"]["sha256"])
    require(objects == baseline["objects"] and versions == baseline["versions"])
    require(queues == baseline["queues"])
    observed={"objects":objects,"versions":versions,"queues":queues}
    if metadata:
        observed["metadata"]=module.metadata(baseline["database"],objects,queues)
        require(observed["metadata"] == baseline["metadata"])
    return module,baseline,observed

def require_volume_consumers(containers,volume_path):
    consumers=[]
    for container in containers:
        for mount in container["Mounts"]:
            if mount.get("Type")=="tmpfs":continue
            require(mount.get("Type") in ["bind","volume"] and isinstance(mount.get("Source"),str) and mount["Source"].startswith("/"))
            source=str(Path(mount["Source"]).resolve(strict=True))
            overlap=os.path.commonpath([source,volume_path]) in [source,volume_path]
            if mount.get("Name")=="uvanoo-dev-minio-data" or overlap:
                require(container["Name"]=="/uvanoo-dev-minio" and source==volume_path)
                consumers.append(container["Name"])
    require(consumers==["/uvanoo-dev-minio"])

def minio_contents(config):
    _,baseline,observed=current_storage(config)
    module=storage_library(config)
    require(module.containers() == config["infrastructureBaseline"])
    volume=docker(["volume","inspect","uvanoo-dev-minio-data"])[0]
    require(volume == config["minioVolume"])
    mount=Path(volume["Mountpoint"]);st=mount.stat()
    require({"resolved":str(mount.resolve()),"device":st.st_dev,"inode":st.st_ino} == config["minioVolumeIdentity"])
    ids=[x["Id"] for x in docker_get("/containers/json?all=1")]
    require_volume_consumers(docker(["inspect",*ids]) if ids else [],str(mount.resolve()))
    container=docker(["inspect","uvanoo-dev-minio"])[0]
    require(container["Mounts"] == config["minioMounts"])
    require(container["Config"]["Image"] == config["minioImage"])
    return {"complete":True,"retainedVolumeIdentityVerified":True,
            "inventorySha256":digest(canonical(observed))}

def minio_credentials(config):
    services,tasks=zero_state();validate_zero_baseline(services,tasks,config["zeroBaseline"])
    env=dict(x.split("=",1) for x in next(x for x in services if x["Spec"]["Name"]==STACK+"_web")["Spec"]["TaskTemplate"]["ContainerSpec"]["Env"])
    credential=private_json(config["appStorageCredential"])
    require(credential["accessKey"]==env["R2_ACCESS_KEY_ID"] and credential["secretKey"]==env["R2_SECRET_ACCESS_KEY"])
    module=storage_library(config)
    # HEAD requests prove the existing DEV app credential without downloading content.
    baseline=private_json(config["storageBaseline"]["path"],config["storageBaseline"]["sha256"])
    require(len(baseline["objects"]) > 0)
    key=sorted(baseline["objects"])[0]
    value=module.metadata_for(key);require(value == baseline["metadata"][key])
    # Supported DEV MinIO administrative authentication, confined to its namespace.
    command=r'''set -eu
case "$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD" in *[!a-zA-Z0-9:_-]*) exit 8;; esac
printf 'user = "%s:%s"\n' "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" | curl --disable -sS --fail --max-time 1 --aws-sigv4 aws:amz:us-east-1:s3 --config - 'http://127.0.0.1:9000/uvanoo-dev?list-type=2'
'''
    body=execute(["docker","exec","uvanoo-dev-minio","sh","-c",command])
    import xml.etree.ElementTree as ET
    tree=ET.fromstring(body)
    require(tree.findtext("{*}Name") == "uvanoo-dev" and tree.findtext("{*}IsTruncated") == "false")
    return {"adminIdentityVerified":True,"appIdentityVerified":True,
            "receiptSha256":digest(canonical({"adminInventory":digest(body),"appHead":value}))}

def references(config):
    module,baseline,observed=current_storage(config,True)
    scope=private_json(config["storageScope"]["path"],config["storageScope"]["sha256"])
    require(scope["status"] == "PASS" and scope["applicationAndRecoveryBaseTables"] == 243)
    require(scope["migrationLedgerTables"] == 1 and scope["unclassifiedAdditionalKeys"] == 0)
    binding=private_json(config["storageBinding"]["path"],config["storageBinding"]["sha256"])
    scan=private_json(config["storageFullScan"]["path"],config["storageFullScan"]["sha256"])
    require(binding["sourceSha"]==config["sourceSha"] and binding["databaseOid"]==config["databaseOid"])
    require(binding["storageBaselineSha256"]==config["storageBaseline"]["sha256"])
    require(binding["fullScanSha256"]==config["storageFullScan"]["sha256"])
    require(binding["scopeSha256"]==config["storageScope"]["sha256"])
    require(binding["databaseWriteCounters"]==config["databaseWriteCounters"])
    require(scan["sourceSha"]==config["sourceSha"] and len(scan["tables"])==243)
    require(binding["referencesSha256"]==digest(canonical(scan["references"])))
    pg=pg_observation(config);require(pg["stats"] == config["databaseWriteCounters"])
    allowed,recovery=module.allowlist();module.verify_recovery(recovery)
    missing,evidence=module.reconcile(baseline["database"],observed["objects"],allowed,
        observed["metadata"],observed["versions"],observed["queues"])
    return {"missingObjects":len(missing),"mismatchedObjects":0,"allReferencesCovered":len(missing)==0,
        "receiptSha256":digest(evidence),"missingIdentitySha256":missing,
        "exceptionId":"owner-approved-dev-nine-20261029","recoveryEvidenceSha256":recovery}

def queue_safety(config):
    services,tasks=zero_state();validate_zero_baseline(services,tasks,config["zeroBaseline"])
    module=storage_library(config)
    baseline=private_json(config["storageBaseline"]["path"],config["storageBaseline"]["sha256"])
    observed=module.queue_inventory();require(observed == baseline["queues"])
    # No worker, scheduler or web process is admitted to dispatch the retained jobs.
    return {"outboundExcluded":True,"inventoryVerified":True,"receiptSha256":digest(canonical(observed))}

def cross_store_sample(config):
    started=dt.datetime.now(dt.timezone.utc).isoformat()
    with ThreadPoolExecutor(max_workers=5) as pool:
        pg=pool.submit(pg_observation,config);storage=pool.submit(current_storage,config)
        metrics=pool.submit(storage_metrics,config);redis=pool.submit(redis_observation)
        zero=pool.submit(zero_state)
        pg=pg.result();_,baseline,observed=storage.result();metrics=metrics.result()
        redis=redis.result();services,tasks=zero.result()
    require(pg["stats"] == config["databaseWriteCounters"] and pg["wopiEvents"] == 0)
    require(pg["oid"] == config["databaseOid"])
    validate_zero_baseline(services,tasks,config["zeroBaseline"])
    ended=dt.datetime.now(dt.timezone.utc).isoformat()
    require(0 <= timestamp(ended)-timestamp(started) <= 2.3)
    return {"sourceSha":config["sourceSha"],"epoch":config["epoch"],"collectorSha256":digest(Path(__file__).read_bytes()),"configSha256":interval_config_identity(config),"startedAt":started,"observedAt":ended,
        "status":"OK","zeroBaselineSha256":digest(canonical(config["zeroBaseline"])),
        "databaseWriteCounters":pg["stats"],"wopiEvents":0,"unapprovedPostgresClients":0,
        "unapprovedRedisClients":redis["unapprovedClients"],"storageWriters":metrics["writers"],
        "storageWriteCounters":metrics["writeCounters"],"inventorySha256":digest(canonical(observed)),
        "storageBaselineSha256":config["storageBaseline"]["sha256"]}

def verified_cross_store_interval(config):
    require(digest(Path(__file__).read_bytes())==config["collectorSha256"])
    require(digest(Path(__file__).with_name("sample_release_interval.py").read_bytes())==config["samplerSha256"])
    raw=private_stream(config["crossStoreContinuationPath"])
    samples=[json.loads(line) for line in raw[:raw.rfind(b"\n")+1].splitlines() if line]
    require(len(samples)>=13 and timestamp(samples[-1]["observedAt"])-timestamp(samples[0]["observedAt"])>=60)
    require(0<=time.time()-timestamp(samples[-1]["observedAt"])<=5)
    previous=None
    for sample in samples:
        require(sample["sourceSha"]==config["sourceSha"] and sample["epoch"]==config["epoch"])
        require(sample["collectorSha256"]==config["collectorSha256"] and sample["configSha256"]==interval_config_identity(config))
        require(sample["samplerSha256"]==config["samplerSha256"])
        require(sample["status"]=="OK" and sample["zeroBaselineSha256"]==digest(canonical(config["zeroBaseline"])))
        require(sample["databaseWriteCounters"]==config["databaseWriteCounters"])
        require(sample["storageWriteCounters"]==config["minioWriteCounters"])
        require(sample["storageBaselineSha256"]==config["storageBaseline"]["sha256"])
        require(all(sample[k]==0 for k in ["wopiEvents","unapprovedPostgresClients","unapprovedRedisClients","storageWriters"]))
        require(0<=timestamp(sample["observedAt"])-timestamp(sample["startedAt"])<=2.3)
        if previous:
            require(0<timestamp(sample["observedAt"])-timestamp(previous["observedAt"])<=5)
            require(sample["inventorySha256"]==previous["inventorySha256"])
        previous=sample
    return samples

def cross_store(config):
    samples=verified_cross_store_interval(config)
    capture=private_json(config["releaseCapture"]["path"],config["releaseCapture"]["sha256"])
    require(capture["sourceSha"]==config["sourceSha"] and capture["databaseOid"]==config["databaseOid"])
    require(timestamp(samples[0]["observedAt"])<=timestamp(capture["captureStartedAt"])<=timestamp(capture["captureFinishedAt"])<=timestamp(samples[-1]["observedAt"]))
    manifest=private_json(Path("/opt/uvanoo-dev/release-evidence")/config["sourceSha"]/"manifest.json")
    require(manifest["sourceSha"]==config["sourceSha"] and manifest["databaseOid"]==config["databaseOid"])
    require(capture["backupSha256"]==manifest["backup"]["sha256"])
    require(capture["restoreReceiptSha256"]==manifest["admission"]["restoreReceiptSha256"])
    require(timestamp(capture["captureStartedAt"])<=timestamp(manifest["backup"]["createdAt"])<=timestamp(capture["captureFinishedAt"]))
    require(timestamp(manifest["backup"]["restoredAt"])<=timestamp(samples[-1]["observedAt"]))
    current=cross_store_sample(config)
    require(current["inventorySha256"] == samples[-1]["inventorySha256"])
    return {"consistent":True,"noWriterIntervalVerified":True,
        "receiptSha256":digest(canonical({"current":current,"intervalStartsAt":samples[0]["observedAt"],
            "intervalEndsAt":samples[-1]["observedAt"],"observationsSha256":digest(canonical(samples))}))}


CHECKS={"minioContents":minio_contents,"minioCredentials":minio_credentials,"objectReferences":references,"queueSafety":queue_safety,"crossStoreConsistency":cross_store,"ownerMaintenanceHold":owner_hold,"independentWatchdog":watch,"legacyIsolation":legacy,
        "persistentFourZero":four_zero,"collaboraObservedInterval":collabora}

def main():
    require(len(sys.argv) == 5)
    path,source,phase,check=sys.argv[1:]
    config=private_json(path)
    require(config["target"] == TARGET and config["sourceSha"] == source)
    require(phase == "web" and check in CHECKS)
    started=time.monotonic()
    facts=CHECKS[check](config)
    require(time.monotonic()-started < 2.3)
    print(json.dumps({"version":1,"target":TARGET,"sourceSha":source,"phase":phase,
        "check":check,"observedAt":dt.datetime.now(dt.timezone.utc).isoformat(),"facts":facts}))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("DEV_OBSERVATION_REJECTED",file=sys.stderr)
        sys.exit(1)
