#!/usr/bin/env python3
"""Persist fresh DEV cross-store observations; stop on any failure or gap."""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import time
import collect_release_observations as m

def main():
    m.require(len(sys.argv)==3)
    config_path,source=sys.argv[1:]
    config=m.private_json(config_path)
    m.require(config["sourceSha"]==source and config["target"]==m.TARGET)
    producer=m.digest(Path(__file__).read_bytes())
    m.require(producer==config["samplerSha256"])
    m.require(m.digest(Path(m.__file__).read_bytes())==config["collectorSha256"])
    path=Path(config["crossStoreContinuationPath"])
    m.require(path.is_absolute() and path.resolve()==path)
    deadline=time.monotonic()+7200
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as output:
        previous=None
        while time.monotonic()<deadline:
            current_config=m.private_json(config_path)
            m.require(m.interval_config_identity(current_config)==m.interval_config_identity(config))
            m.require(m.digest(Path(__file__).read_bytes())==producer)
            m.require(m.digest(Path(m.__file__).read_bytes())==config["collectorSha256"])
            sample=m.cross_store_sample(config)
            sample["samplerSha256"]=producer
            if previous is not None:
                m.require(0<m.timestamp(sample["observedAt"])-m.timestamp(previous["observedAt"])<=5)
            output.write(json.dumps(sample,separators=(",",":"))+"\n")
            output.flush();os.fsync(output.fileno())
            previous=sample
            time.sleep(1)
    # No automatic continuation or fabricated freshness beyond this bounded run.

if __name__=="__main__":
    try:main()
    except Exception:
        print("DEV_INTERVAL_STOPPED_FAIL_CLOSED",file=sys.stderr)
        sys.exit(1)
