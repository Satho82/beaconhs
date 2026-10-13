#!/usr/bin/env python3
"""Read-only evidence collection; never calls fencing, capture, recovery or SQL."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import backup_controller as c
import backup_fence as f
import dev_recovery as r
import pg16_client

def call(stage, args, runner=subprocess.run):
    try:
        p = runner(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                   timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return {"stage": stage, "status": "EXECUTION_FAILED"}, None
    # No argv, raw stdout, stderr, environment, names or definitions are exported.
    category = ("MISSING_OBJECT" if b"No such" in p.stderr else
                "ACCESS_DENIED" if b"permission denied" in p.stderr.lower() else
                "OTHER" if p.returncode else "NONE")
    result = {"stage": stage, "status": "PASS" if p.returncode == 0 else "EXIT_FAILED",
              "exitCode": p.returncode, "errorClass": category}
    if p.returncode:
        return result, None
    try:
        value = p.stdout.decode().split() if stage == "CONTAINER_LIST" else json.loads(p.stdout)
    except (ValueError, UnicodeError):
        return dict(result, status="INVALID_OUTPUT"), None
    return result, value

def probe():
    results = []
    for stage, args in (
        ("PG_CONTAINER_INSPECT", ["docker", "inspect", c.PG]),
        ("PG_IMAGE_INSPECT", ["docker", "image", "inspect", pg16_client.IMAGE]),
        ("CONTAINER_LIST", ["docker", "ps", "-aq"]),
    ):
        result, value = call(stage, args)
        results.append(result)
        if result["status"] != "PASS":
            return results
        if stage == "CONTAINER_LIST":
            ids = value
    if ids:
        result, _ = call("CONTAINER_INSPECT", ["docker", "inspect"]+ids)
        results.append(result)
    return results

def compare_services(baseline, live):
    selected = f.select(baseline)
    result = []
    for role, sid in sorted(selected.items()):
        old, current = baseline[sid], live.get(sid)
        result.append({
            "role": role, "exists": current is not None,
            "specEqual": current is not None and old["Spec"] == current["Spec"],
            "versionEqual": current is not None and old["Version"] == current["Version"],
            "savedVersion": old["Version"]["Index"],
            "currentVersion": current["Version"]["Index"] if current else None,
            "savedReplicas": old["Spec"]["Mode"]["Replicated"]["Replicas"],
            "currentReplicas": current["Spec"].get("Mode",{}).get("Replicated",{}).get("Replicas") if current else None,
        })
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("attempt")
    a = parser.parse_args()
    r.require(os.geteuid() == 0, "OWNER_SUDO_SSH_REQUIRED")
    work = r.private(a.attempt, True)
    r.require(work.parent == Path("/opt/uvanoo-dev/backups/recovery")
              and re.fullmatch(r"capture\.[A-Za-z0-9]+", work.name),
              "ATTEMPT_PATH_REJECTED")
    lock = os.open(work/"operation.lock", os.O_RDONLY | os.O_NOFOLLOW)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = c.read(work/"preflight-state.private.json")
        events = [c.read(p) for p in sorted((work/"journal").glob("*.private.json"))]
        failures = [e["value"] for e in events if e.get("event") == "failure-refence"]
        result = {
            "readOnly": True, "fenceStatePresent": (work/"fence-state.private.json").exists(),
            "journalCount": len(events),
            "mutationIntentPresent": any(str(e.get("event","")).startswith(
                ("replica-intent-", "restore-intent-")) for e in events),
            "failureOwnedCounts": [len(v.get("owned",{})) for v in failures],
            "failureUnverifiedCounts": [len(v.get("unverifiedServiceIds",[])) for v in failures],
            "services": compare_services(state["baseline"], f.Docker().services()),
            "readOnlyProbes": [probe() for _ in range(3)],
            "historicalFailureAttribution": "NOT_PROVEN_BY_A_LATER_SUCCESS",
        }
        print(json.dumps(result))
    finally:
        os.close(lock)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        code = str(exc) if isinstance(exc, r.Rejected) and re.fullmatch("[A-Z0-9_]{1,80}", str(exc)) else "READ_ONLY_DIAGNOSTIC_BLOCKED"
        print(json.dumps({"readOnly": True, "error": code}))
        sys.exit(1)
