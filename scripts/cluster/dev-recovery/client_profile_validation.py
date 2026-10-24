#!/usr/bin/env python3
"""Reuse synthetic recovery contracts with independently pinned client and restore profiles."""
import os
from pathlib import Path
import dev_recovery as r
import pg16_client
r.require(os.environ.get("GITHUB_ACTIONS") == "true","HOSTED_ONLY")
path=Path(__file__).with_name("disposable_validation.py")
source=path.read_text().replace(
    '"-e", "POSTGRES_DB=beaconhs", "-e", "POSTGRES_PASSWORD", restore.IMAGE]',
    '"-e", "POSTGRES_DB=beaconhs", "-e", "POSTGRES_PASSWORD", __import__("pg16_client").IMAGE]')
r.run(["docker","pull",pg16_client.IMAGE])
exec(compile(source,str(path),"exec"),{"__file__":str(path),"__name__":"__main__"})
print("INDEPENDENT_CLIENT_RESTORE_PROFILE_CONTRACT_PASS")
