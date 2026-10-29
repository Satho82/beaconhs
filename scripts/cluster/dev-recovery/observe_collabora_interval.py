#!/usr/bin/env python3
"""Retain real aggregate samples for a fresh DEV interval, never historical proof."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from collect_collabora_observer import collect, read_config, require

MIN_SECONDS = 60
MAX_GAP_SECONDS = 5

def stamp(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()

def validate_samples(samples, source, epoch):
    require(len(samples) >= 13)
    first = samples[0]
    require(stamp(samples[-1]["observedAt"]) - stamp(first["observedAt"]) >= MIN_SECONDS)
    previous = None
    for v in samples:
        require(v["version"] == 1 and v["status"] == "OBSERVED")
        require(v["target"] == "https://dev.uvanoo.com")
        require(v["sourceSha"] == source and v["epoch"] == epoch)
        require(v["historicalSaveState"] == "UNKNOWN" and v["drainageProven"] is False)
        require(v["taskCoverageSha256"] == first["taskCoverageSha256"])
        require(v["collaboraTasks"] > 0 and v["webTasks"] > 0)
        for k in ["activeSessions", "activeDocuments", "inFlight", "failedSaves", "unknownOutcomes"]:
            require(type(v[k]) is int and v[k] == 0)
        if previous:
            gap = stamp(v["observedAt"]) - stamp(previous["observedAt"])
            require(0 < gap <= MAX_GAP_SECONDS)
            require(v["eventCount"] >= previous["eventCount"])
            require(v["completedSaves"] >= previous["completedSaves"])
            if v["eventCount"] == previous["eventCount"]:
                require(v["completionWatermark"] == previous["completionWatermark"])
        previous = v
    return {
        "version": 1, "target": first["target"], "sourceSha": source, "epoch": epoch,
        "historicalSaveState": "UNKNOWN", "historicalCoverageVerified": False,
        "observationStartsAt": first["observedAt"], "observationEndsAt": samples[-1]["observedAt"],
        "maximumGapSeconds": MAX_GAP_SECONDS, "sampleCount": len(samples),
        "taskCoverageSha256": first["taskCoverageSha256"],
        "completionWatermark": samples[-1]["completionWatermark"],
        "newIntervalObserved": True, "releaseAdmitted": False, "samples": samples,
    }

def main():
    config = read_config()
    output = Path(sys.argv[1])
    require(output.parent.resolve() == Path("/opt/uvanoo-dev/monitor-private"))
    require(output.name.startswith("observed-interval-") and output.suffix == ".json")
    require(not output.exists())
    samples = []
    deadline = time.monotonic() + 90
    while True:
        require(time.monotonic() < deadline)
        samples.append(collect(config))
        if len(samples) > 1:
            require(0 < stamp(samples[-1]["observedAt"]) - stamp(samples[-2]["observedAt"]) <= MAX_GAP_SECONDS)
        if stamp(samples[-1]["observedAt"]) - stamp(samples[0]["observedAt"]) >= MIN_SECONDS:
            break
        time.sleep(1)
    receipt = validate_samples(samples, config["wopi"]["sourceSha"], config["wopi"]["epoch"])
    encoded = (json.dumps(receipt, sort_keys=True) + "\n").encode()
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(encoded)
        f.flush()
        os.fsync(f.fileno())
    print(json.dumps({"status": "INTERVAL_OBSERVED", "sha256": hashlib.sha256(encoded).hexdigest(),
                      "historicalSaveState": "UNKNOWN", "releaseAdmitted": False}))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print('{"status":"UNKNOWN","releaseAdmitted":false}')
        sys.exit(1)
