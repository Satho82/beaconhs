#!/usr/bin/env python3
"""Pinned PostgreSQL16.15 client bridge; no host client installation or TCP endpoint."""
import json
import os
from pathlib import Path
import subprocess
import sys
import dev_recovery as r
from restore_disposable import IMAGE

# Independently observed DEV server identity; client bytes remain bound to IMAGE.
SERVER_IMAGE = "sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94"

def checked_container(name, inspect=None):
    inspect = inspect or (lambda args: json.loads(r.run(args)))
    r.require(isinstance(name, str) and r.NAME.fullmatch(name), "PG_CONTAINER_NAME_REJECTED")
    c = inspect(["docker", "inspect", name])[0]
    image = inspect(["docker", "image", "inspect", IMAGE])[0]
    r.require(c["Image"] in (SERVER_IMAGE, image["Id"]) and c["State"]["Running"], "PINNED_PG_IMAGE_REQUIRED")
    r.require(not c["HostConfig"].get("PortBindings"), "PG_PUBLISHED_PORT_REJECTED")
    return c["Id"]

def command(tool, args, container, role, database, options):
    r.require(tool in {"psql", "pg_dump", "pg_restore"}, "PG_TOOL_REJECTED")
    r.require(role == "beaconhs_backup" and database == "beaconhs", "BACKUP_ROLE_REQUIRED")
    # A fresh pinned client sees only the existing server's Unix socket directory.
    # No TCP, server data mount, Docker socket, credential or server mutation.
    c = json.loads(r.run(["docker", "inspect", container]))[0]
    r.require(checked_container(container) == c["Id"], "SERVER_IDENTITY_CHANGED")
    pid = c["State"].get("Pid")
    r.require(type(pid) is int and pid > 1, "SERVER_PID_REJECTED")
    socket = "/proc/"+str(pid)+"/root/var/run/postgresql"
    return ["docker", "run", "--rm", "-i", "--network", "none", "--read-only",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--user", "postgres", "--pids-limit", "64", "--memory", "512m", "--cpus", "1",
            "--label", "uvanoo.recovery=pg-client", "--label", "uvanoo.server="+c["Id"],
            "--mount", "type=bind,src="+socket+",dst=/var/run/postgresql,readonly",
            "--entrypoint", tool, "-e",
            "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=1800000 "+options,
            "-e", "PGAPPNAME=uvanoo-protected-backup", IMAGE]+args

def is_client(c, server):
    if c["Config"].get("Labels", {}).get("uvanoo.recovery") != "pg-client":
        return False
    image = json.loads(r.run(["docker", "image", "inspect", IMAGE]))[0]
    h, labels = c["HostConfig"], c["Config"].get("Labels", {})
    expected = "/proc/"+str(server["State"]["Pid"])+"/root/var/run/postgresql"
    mounts = c.get("Mounts", [])
    r.require(c["Image"] == image["Id"] and labels.get("uvanoo.server") == server["Id"]
              and h.get("NetworkMode") == "none" and h.get("ReadonlyRootfs") is True
              and not h.get("Privileged") and not h.get("PortBindings")
              and c["Config"].get("User") == "postgres"
              and h.get("CapDrop") == ["ALL"]
              and "no-new-privileges" in h.get("SecurityOpt", [])
              and len(mounts) == 1 and mounts[0]["Source"] == expected
              and mounts[0]["Destination"] == "/var/run/postgresql"
              and mounts[0]["RW"] is False, "CLIENT_ISOLATION_REJECTED")
    return True

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
