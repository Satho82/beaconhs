#!/usr/bin/python3
"""Return only PASS/DENY for an explicitly pinned DEV fixture session."""
import hashlib
import json
import os
import stat
import pathlib
import re
import subprocess
import sys

MANIFEST = pathlib.Path('/opt/uvanoo-fast-v2-browser-v150/fixture-identities.json')
PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
PIN = MANIFEST.with_suffix('.sha256')


def secure(path, directory=False):
    st = path.lstat()
    return st.st_uid == 0 and st.st_gid == 0 and not (st.st_mode & 0o022) and (stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode))


def verify(user_id, session_id, expected_email):
    if not PATTERN.fullmatch(user_id) or not PATTERN.fullmatch(session_id):
        return False
    if not all(secure(path, directory=True) for path in (pathlib.Path('/opt'), MANIFEST.parent)):
        return False
    if not all(secure(path) for path in (pathlib.Path(__file__), MANIFEST, PIN)):
        return False
    digest = PIN.read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{64}', digest) or hashlib.sha256(MANIFEST.read_bytes()).hexdigest() != digest:
        return False
    identities = json.loads(MANIFEST.read_text())
    email = identities.get(user_id)
    if email != expected_email or email not in ('dev-release-smoke@uvanoo.invalid', 'dev-isolation-auditor@uvanoo.invalid'):
        return False
    sql = ("BEGIN READ ONLY; SELECT CASE WHEN EXISTS (SELECT 1 FROM \"session\" s "
           "JOIN \"user\" u ON u.id=s.\"userId\" WHERE "
           f"s.id='{session_id}' AND u.id='{user_id}' AND u.email='{email}' "
           "AND s.\"expiresAt\">now() AND u.\"isSuperAdmin\"=false AND u.disabled_at IS NULL "
           "AND s.impersonating_user_id IS NULL AND s.impersonation_tenant_id IS NULL "
           "AND s.impersonation_started_at IS NULL AND s.impersonation_expires_at IS NULL) "
           "THEN 'PASS' ELSE 'DENY' END; ROLLBACK;")
    result = subprocess.run(
        ['/usr/bin/docker', 'exec', 'uvanoo-dev-postgres', 'psql', '-X', '-qAt',
         '-v', 'ON_ERROR_STOP=1', '-U', 'beaconhs_backup', '-d', 'uvanoo_dev', '-c', sql],
        capture_output=True, text=True, timeout=10, check=True,
    )
    return result.stdout.strip() == 'PASS'


if __name__ == '__main__':
    try:
        permitted = len(sys.argv) == 4 and verify(sys.argv[1], sys.argv[2], sys.argv[3])
    except Exception:
        permitted = False
    print('PASS' if permitted else 'DENY')
    raise SystemExit(0 if permitted else 1)
