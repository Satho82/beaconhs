#!/usr/bin/env python3
"""Read only the approved host-local DEV token for an internal subprocess pipe."""
import os
from pathlib import Path
import stat
import sys

TOKEN = Path("/opt/uvanoo-dev/monitor-private/dokploy.token")

def read_token(path):
    st = path.lstat()
    parent = path.parent.lstat()
    if not (path.resolve() == path and stat.S_ISREG(st.st_mode) and
            st.st_uid == os.geteuid() and stat.S_IMODE(st.st_mode) == 0o600 and
            stat.S_ISDIR(parent.st_mode) and parent.st_uid == os.geteuid() and
            stat.S_IMODE(parent.st_mode) & 0o077 == 0 and 0 < st.st_size <= 4096):
        raise ValueError("Private DEV token unavailable")
    token = path.read_text().strip()
    if not token or any(c.isspace() for c in token) or not token.isascii():
        raise ValueError("Private DEV token invalid")
    return token

if __name__ == "__main__":
    try:
        if os.geteuid() != 0:
            raise ValueError()
        sys.stdout.write(read_token(TOKEN))
    except Exception:
        sys.stderr.write("Private DEV credential unavailable\n")
        sys.exit(1)
