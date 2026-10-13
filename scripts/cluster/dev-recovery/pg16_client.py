#!/usr/bin/env python3
"""Pinned PostgreSQL16.15 client bridge; no host client installation or TCP endpoint."""
import json
import os
from pathlib import Path
import subprocess
import sys
import dev_recovery as r
from restore_disposable import IMAGE

def checked_container(name, inspect=None):
    inspect = inspect or (lambda args: json.loads(r.run(args)))
    r.require(isinstance(name, str) and r.NAME.fullmatch(name), "PG_CONTAINER_NAME_REJECTED")
    c = inspect(["docker", "inspect", name])[0]
    image = inspect(["docker", "image", "inspect", IMAGE])[0]
    r.require(c["Image"] == image["Id"] and c["State"]["Running"], "PINNED_PG_IMAGE_REQUIRED")
    r.require(not c["HostConfig"].get("PortBindings"), "PG_PUBLISHED_PORT_REJECTED")
    return c["Id"]

def command(tool, args, container, role, database, options):
    r.require(tool in {"psql", "pg_dump", "pg_restore"}, "PG_TOOL_REJECTED")
    r.require(role == "beaconhs_backup" and database == "beaconhs", "BACKUP_ROLE_REQUIRED")
    return ["docker", "exec", "-i", "-e",
            "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=1800000 "+options,
            "-e", "PGAPPNAME=uvanoo-protected-backup", container, tool]+args

def execute(tool, args):
    os.umask(0o077)
    container = checked_container(os.environ["UVANOO_PG_CONTAINER"])
    role, database = os.environ.get("PGUSER"), os.environ.get("PGDATABASE")
    args = list(args)
    source, destination = None, None
    if tool == "pg_dump":
        if args != ["--version"]:
            r.require(args == ["--format=custom", "--compress=9", "--serializable-deferrable",
                               "--lock-wait-timeout=30s", "--file", args[-1]],
                      "PG_DUMP_ARGUMENTS_REJECTED")
            destination = Path(args.pop())
            args.pop()
            r.private(destination.parent, True)
            args += ["-h", "/var/run/postgresql", "-U", role, "-d", database]
    elif tool == "psql":
        allowed = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
        if args[:6] != allowed:
            raise r.Rejected("PSQL_ARGUMENTS_REJECTED")
        if len(args) > 6:
            r.require(len(args) == 8 and args[6] == "-f", "PSQL_FILE_ARGUMENTS_REJECTED")
            source = r.private(args[7]).open("rb")
            args = allowed
        args += ["-h", "/var/run/postgresql", "-U", role, "-d", database]
    else:
        r.require(len(args) == 2 and args[0] == "--list", "PG_RESTORE_ARGUMENTS_REJECTED")
        source = r.private(args[1]).open("rb")
        args = ["--list"]
    cmd = command(tool, args, container, role, database, os.environ.get("PGOPTIONS", ""))
    output = None
    try:
        if destination:
            fd = os.open(destination, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
            output = os.fdopen(fd, "wb")
        p = subprocess.run(cmd, stdin=source or sys.stdin.buffer,
                           stdout=output or sys.stdout.buffer, stderr=subprocess.DEVNULL, timeout=1800)
        r.require(p.returncode == 0, "PINNED_CLIENT_FAILED")
        if output:
            output.flush()
            os.fsync(output.fileno())
    finally:
        if source: source.close()
        if output: output.close()

if __name__ == "__main__":
    try:
        execute(sys.argv[1], sys.argv[2:])
    except Exception as exc:
        print(json.dumps({"error": str(exc) if isinstance(exc, r.Rejected)
                          else "PINNED_CLIENT_REJECTED"}), file=sys.stderr)
        sys.exit(1)
