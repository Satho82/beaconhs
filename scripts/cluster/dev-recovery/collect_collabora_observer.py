#!/usr/bin/env python3
"""DEV aggregate observer. Read-only facts, never a drainage/admission receipt."""
import base64
import datetime as dt
import json
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

STACK = "uvanoo-v1-4-dev-gniriv"
CONFIG = Path("/opt/uvanoo-dev/monitor-private/collabora-observer.json")
METRICS = {
    "activeSessions": "document_active_views_active_count_total",
    "activeDocuments": "kit_assigned_count",
}

def require(value):
    if not value:
        raise ValueError("DEV_OBSERVER_UNKNOWN")

def execute(args, data=None):
    p = subprocess.run(args, input=data, capture_output=True, timeout=2, env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"})
    require(p.returncode == 0 and len(p.stdout) <= 65536)
    return p.stdout.decode()

def read_config(path=CONFIG):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid == os.geteuid()
            and stat.S_IMODE(st.st_mode) == 0o600 and path.resolve() == path)
    parent = path.parent.stat()
    require(parent.st_uid == os.geteuid() and stat.S_IMODE(parent.st_mode) & 0o077 == 0)
    c = json.loads(path.read_text())
    require(c["version"] == 1 and c["target"] == "https://dev.uvanoo.com")
    require(c["collabora"]["service"] == STACK + "_collabora")
    require(c["collabora"]["path"] == "/cool/getMetrics")
    require(c["wopi"]["url"] == c["target"] + "/api/internal/recovery/wopi")
    return c

def tasks(service):
    require(service in [STACK + "_collabora", STACK + "_web"])
    wanted = json.loads(execute(["docker", "service", "inspect", "--format",
        "{{json .Spec.Mode.Replicated.Replicas}}", service]))
    require(type(wanted) is int)
    expected = execute(["docker", "service", "ps", service, "--no-trunc",
                        "--filter", "desired-state=running", "--format", "{{.ID}}"]).split()
    ids = execute(["docker", "ps", "--filter",
                   "label=com.docker.swarm.service.name=" + service,
                   "--format", "{{.ID}}"]).split()
    require(wanted > 0 and len(expected) == wanted and len(ids) == wanted)
    result = []
    actual = []
    for cid in ids:
        # Inspect selected fields only; do not collect environment credentials.
        info = json.loads(execute(["docker", "inspect", "--format",
            '{"pid":{{.State.Pid}},"running":{{.State.Running}},'
            '"task":{{json (index .Config.Labels "com.docker.swarm.task.id")}}}', cid]))
        require(info["running"] and type(info["pid"]) is int and info["pid"] > 0)
        actual.append(info["task"])
        result.append(info["pid"])
    require(sorted(actual) == sorted(expected) and len(set(actual)) == wanted)
    return result

def request(pid, port, path, authorization):
    # Namespace-local HTTP: never export credentials to the public routing layer.
    require(type(pid) is int and pid > 0)
    require((port, path) in [(9980, "/cool/getMetrics"),
                            (3000, "/api/internal/recovery/wopi")])
    require(re.fullmatch(r"(Basic|Bearer) [A-Za-z0-9_+/=-]+", authorization))
    body = execute(["nsenter", "-t", str(pid), "-n", "curl", "--disable", "--silent",
        "--max-time", "1.5", "--max-filesize", "65536", "--proto", "=http",
        "--config", "-", "--write-out", "\n%{http_code}",
        f"http://127.0.0.1:{port}{path}"],
        ('header = "Authorization: ' + authorization + '"\n').encode())
    content, sep, status = body.rpartition("\n")
    require(sep and status == "200")
    return content

def parse_metrics(body):
    result = {}
    for field, metric in METRICS.items():
        values = [line.split()[1:] for line in body.splitlines()
                  if line.startswith(metric + " ")]
        require(len(values) == 1 and len(values[0]) == 1)
        value = values[0][0]
        require(re.fullmatch(r"[0-9]+", value))
        result[field] = int(value)
    return result

def parse_save(body, config, started, now):
    v = json.loads(body)
    require(v["version"] == 1 and v["composeId"] == "wYb0LxLQrvj2FPI21i-Oj")
    require(v["sourceSha"] == config["sourceSha"] and v["epoch"] == config["epoch"])
    require(re.fullmatch(r"[a-f0-9]{40}", v["sourceSha"]))
    require(re.fullmatch(r"[a-f0-9]{64}", v["epoch"]))
    observed = dt.datetime.fromisoformat(v["observedAt"].replace("Z", "+00:00")).timestamp()
    require(started <= observed <= now and now - observed <= 5)
    require(v["validForSeconds"] == 15 and v["drainageProven"] is False)
    require(v["coverage"] == "REQUIRES_INDEPENDENT_TASK_AND_CUTOVER_VERIFICATION")
    require(re.fullmatch(r"[a-f0-9-]{36}", v["producer"]))
    require(re.fullmatch(r"[a-f0-9]{64}", v["completionWatermark"]))
    for key in ["inFlight", "failedSaves", "unknownOutcomes", "completedSaves", "eventCount"]:
        require(type(v[key]) is int and v[key] >= 0)
    require(v["eventCount"] <= 10000)
    return v

def collect(config, discover=tasks, fetch=request):
    started = time.time()
    cpids = discover(STACK + "_collabora")
    auth = "Basic " + base64.b64encode(
        (config["collabora"]["username"] + ":" + config["collabora"]["password"]).encode()).decode()
    counts = [parse_metrics(fetch(pid, 9980, "/cool/getMetrics", auth)) for pid in cpids]
    wpids = discover(STACK + "_web")
    saves = [parse_save(fetch(pid, 3000, "/api/internal/recovery/wopi",
                "Bearer " + config["wopi"]["token"]), config["wopi"], started, time.time())
             for pid in wpids]
    require(len(set(v["producer"] for v in saves)) == len(wpids))
    # Shared ledger is global: compare, never sum it across web replicas.
    keys = ["inFlight", "failedSaves", "unknownOutcomes", "completedSaves",
            "eventCount", "completionWatermark"]
    require(all(all(v[k] == saves[0][k] for k in keys) for v in saves))
    require(discover(STACK + "_collabora") == cpids and discover(STACK + "_web") == wpids)
    require(time.time() - started <= 5)
    return {"version": 1, "status": "OBSERVED", "target": config["target"],
        "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceSha": config["wopi"]["sourceSha"], "epoch": config["wopi"]["epoch"],
        "taskCoverageSha256": hashlib.sha256(json.dumps(
            [cpids, wpids, sorted(v["producer"] for v in saves)], separators=(",", ":")).encode()).hexdigest(),
        "activeSessions": sum(v["activeSessions"] for v in counts),
        "activeDocuments": sum(v["activeDocuments"] for v in counts),
        **{k: saves[0][k] for k in keys},
        "collaboraTasks": len(cpids), "webTasks": len(wpids),
        "historicalSaveState": "UNKNOWN", "drainageProven": False}

if __name__ == "__main__":
    try:
        print(json.dumps(collect(read_config())))
    except Exception:
        # Never print subprocess diagnostics, URLs, bodies, credentials or document identifiers.
        print('{"version":1,"status":"UNKNOWN","drainageProven":false}')
        sys.exit(1)
