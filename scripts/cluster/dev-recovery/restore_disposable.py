#!/usr/bin/env python3
"""Restore verified encrypted DEV dump into a NEW network-isolated disposable container."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import uuid
import dev_recovery as recovery

IMAGE = "postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d"


def restore(directory, digest, identity, parent, roles_sql, roles_sha):
    parent = recovery.private(parent, True)
    manifest = recovery.verify(directory, digest)
    recovery.require(__import__("shutil").disk_usage(parent).free >= int(
        (3 * manifest["databaseSizeBytes"] + 536870912) * 1.2), "RESTORE_SPACE_INSUFFICIENT")
    roles_sql = recovery.private(roles_sql)
    recovery.require(recovery.sha(roles_sql) == roles_sha, "ROLE_CONTRACT_IDENTITY_REJECTED")
    name = "uvanoo-restore-" + uuid.uuid4().hex
    lock = parent / (".restore-" + digest + ".lock")
    lock.mkdir(mode=0o700)  # Exclusive; a failed/finished operation must be reviewed before another.
    work = Path(tempfile.mkdtemp(prefix=name + "-", dir=parent))
    os.chmod(work, 0o700)
    recovery.write_new(lock / "started.json", recovery.canonical({
        "container": name, "workDirectory": str(work), "manifestSha256": digest}))
    # This is the only destination this helper creates. No existing container name,
    # data mount or database endpoint can be supplied by the caller.
    data = work / "pgdata"
    data.mkdir(mode=0o700)
    dump = recovery.decrypt_component(directory, digest, "database", identity, work / "database.dump")
    os.environ["POSTGRES_PASSWORD"] = secrets.token_urlsafe(48)
    try:
        recovery.run(["docker", "run", "-d", "--name", name, "--network", "none",
                      "--label", "uvanoo.recovery=disposable", "--label", "uvanoo.manifest=" + digest,
                      "--memory", "2g", "--cpus", "1", "--pids-limit", "256",
                      "-e", "POSTGRES_USER=uvanoo_dev", "-e", "POSTGRES_DB=beaconhs",
                      "-e", "POSTGRES_PASSWORD", "--mount", f"type=bind,src={data},dst=/var/lib/postgresql/data",
                      IMAGE])
    finally:
        os.environ.pop("POSTGRES_PASSWORD", None)
    observation = json.loads(recovery.run(["docker", "inspect", name]))[0]
    recovery.require(observation["HostConfig"]["NetworkMode"] == "none"
                     and not observation["HostConfig"].get("PortBindings")
                     and len(observation["Mounts"]) == 1
                     and observation["Mounts"][0]["Source"] == str(data),
                     "RESTORE_ISOLATION_REJECTED")
    ready = False
    for _ in range(60):
        r = subprocess.run(["docker", "exec", name, "pg_isready", "-U", "uvanoo_dev", "-d", "beaconhs"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode == 0:
            ready = True
            break
        time.sleep(1)
    recovery.require(ready, "RESTORE_POSTGRES_NOT_READY")
    def sql(content):
        return recovery.run(["docker", "exec", "-i", name, "psql", "-X", "-q", "-A", "-t",
                             "-v", "ON_ERROR_STOP=1", "-U", "uvanoo_dev", "-d", "beaconhs"],
                            input=content)
    recovery.require(sql(b"SHOW server_version_num;").strip() == b"160015", "RESTORE_VERSION_REJECTED")
    # Reviewed role/bootstrap SQL for the isolated destination only. Never execute
    # broad provisioning against a restored or persistent database.
    sql(roles_sql.read_bytes())
    # Drop only the initially empty public schema if the verified dump creates it.
    toc = recovery.run(["pg_restore", "--list", str(dump)]).decode()
    if any(" SCHEMA - public " in line for line in toc.splitlines()):
        sql(b"DROP SCHEMA public;")
    # Preserve archive owners and ACLs. Restore as the isolated bootstrap superuser.
    errors = work / "restore-errors.private.log"
    recovery.write_new(errors, b"")
    with dump.open("rb") as source, errors.open("wb") as diagnostic:
        r = subprocess.run(["docker", "exec", "-i", name, "pg_restore", "--exit-on-error",
                            "--single-transaction", "-U", "uvanoo_dev", "-d", "beaconhs"],
                           stdin=source, stdout=subprocess.DEVNULL, stderr=diagnostic,
                           timeout=1800)
    recovery.require(r.returncode == 0, "RESTORE_ARCHIVE_REJECTED")
    dump.unlink()  # Only the verified temporary plaintext we created.
    result = {"container": name, "workDirectory": str(work), "manifestSha256": digest,
              "postgresImage": IMAGE, "archiveRestore": "PASS",
              "fullSchemaDataSecurityVerification": "REQUIRED_BEFORE_ACCEPTANCE",
              "privateReviewRequired": True}
    recovery.write_new(work / "restore-receipt.private.json", recovery.canonical(result))
    recovery.write_new(lock / "completed.json", recovery.canonical(result))
    # Container and private files retained, including on failure. Never auto-delete
    # a restore database and never auto-resume live writers.
    return result


if __name__ == "__main__":
    os.umask(0o077)
    p = argparse.ArgumentParser()
    for arg in ("directory", "manifest_sha256", "identity", "private_parent", "roles_sql", "roles_sha256"):
        p.add_argument(arg)
    a = p.parse_args()
    try:
        result = restore(a.directory, a.manifest_sha256, a.identity, a.private_parent,
                         a.roles_sql, a.roles_sha256)
        print(json.dumps(result))
    except Exception as e:
        code = str(e) if isinstance(e, recovery.Rejected) else "RESTORE_OPERATION_FAILED"
        print(json.dumps({"error": code}), file=__import__("sys").stderr)
        raise SystemExit(1)
