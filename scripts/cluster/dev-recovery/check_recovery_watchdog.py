#!/usr/bin/env python3
"""DEV maintenance watchdog. Never clears a latch or mutates a service."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys

STACK = "uvanoo-v1-4-dev-gniriv"
ROLES = ("web", "worker", "scheduler", "storage-init", "collabora")
TERMINAL = {"complete", "shutdown", "failed", "rejected", "remove"}
STATE = Path("/opt/uvanoo-dev/recovery-watchdog")

def require(value):
    if not value:
        raise ValueError("DEV_WATCHDOG_UNSAFE")

def execute(args):
    result = subprocess.run(args, capture_output=True, timeout=2,
                            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    require(result.returncode == 0 and len(result.stdout) <= 4_000_000)
    return result.stdout.decode()

def observe(run=execute):
    names = {STACK + "_" + role for role in ROLES}
    services = json.loads(run(["docker", "service", "inspect", *sorted(names)]))
    require(len(services) == len(names))
    require({s["Spec"]["Name"] for s in services} == names)
    require(all(type(s["Spec"]["Mode"]["Replicated"]["Replicas"]) is int
                and s["Spec"]["Mode"]["Replicated"]["Replicas"] == 0 for s in services))
    ids = set()
    for service in services:
        # Never filter desired-state: a shutdown request is not a stopped writer.
        ids.update(run(["docker", "service", "ps", "--no-trunc", "-q", service["ID"]]).split())
    if ids:
        tasks = json.loads(run(["docker", "inspect", *sorted(ids)]))
        require(len(tasks) == len(ids) and {t["ID"] for t in tasks} == ids)
        require(all(t["ServiceID"] in {s["ID"] for s in services}
                    and t["Status"]["State"] in TERMINAL for t in tasks))
    infra = json.loads(run(["docker", "inspect", "uvanoo-dev-postgres",
                           "uvanoo-dev-minio", "uvanoo-dev-redis"]))
    require(len(infra) == 3 and {x["Name"] for x in infra} ==
            {"/uvanoo-dev-postgres", "/uvanoo-dev-minio", "/uvanoo-dev-redis"})
    require(all(x["State"]["Running"] is True
                and x["State"]["Health"]["Status"] == "healthy" for x in infra))
    return {"status": "OK", "observedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "stack": STACK, "desiredReplicas": 0, "activeTasks": 0}

def atomic(path, value):
    temp = path.with_name("." + path.name + "." + str(os.getpid()))
    with open(temp, "x", encoding="utf8") as stream:
        os.chmod(temp, 0o600)
        json.dump(value, stream)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def main():
    os.umask(0o077)
    st = STATE.lstat()
    require(STATE.resolve() == STATE and STATE.is_dir()
            and st.st_uid == os.geteuid() and st.st_mode & 0o077 == 0)
    # An old success can never mask a failure awaiting independent review.
    if (STATE / "latched.json").exists():
        return 1
    try:
        result = observe()
    except Exception:
        atomic(STATE / "latched.json",
               {"status": "STOPPED", "reason": "observation-incomplete-or-unsafe",
                "observedAt": dt.datetime.now(dt.timezone.utc).isoformat()})
        return 1
    atomic(STATE / "heartbeat.json", result)
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(1)
