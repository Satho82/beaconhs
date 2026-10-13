#!/usr/bin/env python3
"""DEV encrypted recovery primitives. No deployment, fencing mutation or retention deletion."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid

HEADER = b"age-encryption.org/v1\n"
HEX = re.compile(r"^[0-9a-f]{64}$")
IMAGE = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA = re.compile(r"^[0-9a-f]{40}$")
NAME = re.compile(r"^[a-z0-9][a-z0-9._-]{0,150}$")
COMPONENTS = {"database", "metadata", "storage", "redis", "clean155"}
REQUIRED = {"database", "metadata", "storage", "redis", "clean155"}


class Rejected(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Rejected(code)


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def private(path, directory=False):
    p = Path(path)
    s = p.lstat()
    require(not stat.S_ISLNK(s.st_mode), "SYMLINK_REJECTED")
    require(s.st_uid == os.getuid() and s.st_mode & 0o077 == 0, "PRIVATE_PERMISSION_REQUIRED")
    require(stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode), "FILE_TYPE_REJECTED")
    return p


def write_new(path, data):
    p = Path(path)
    private(p.parent, True)
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())


def run(args, *, input=None, output=None, timeout=300):
    try:
        r = subprocess.run(args, input=input, stdout=output or subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Rejected("TOOL_EXECUTION_FAILED") from None
    require(r.returncode == 0, "TOOL_EXIT_FAILED")
    return r.stdout


def encrypt(source, recipient_file, destination):
    source = private(source)
    recipient_file = private(recipient_file)
    destination = Path(destination)
    private(destination.parent, True)
    recipients = [x.strip() for x in recipient_file.read_text().splitlines() if x.strip() and not x.startswith("#")]
    require(len(recipients) >= 1 and all(re.fullmatch(r"age1[0-9a-z]{58}", x) for x in recipients),
            "NATIVE_AGE_RECIPIENT_REQUIRED")
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as out:
            run(["age", "-R", str(recipient_file), str(source)], output=out)
            out.flush()
            os.fsync(out.fileno())
        with destination.open("rb") as check:
            require(check.read(len(HEADER)) == HEADER, "ENCRYPTION_FORMAT_REJECTED")
    except Exception:
        # Keep failed output for diagnosis, never overwrite/promote it.
        raise
    return {"file": destination.name, "sha256": sha(destination), "bytes": destination.stat().st_size}


def verify_file(directory, item):
    require(set(item) == {"file", "sha256", "bytes", "kind"}, "COMPONENT_FIELDS_REJECTED")
    require(item["kind"] in COMPONENTS, "COMPONENT_KIND_REJECTED")
    require(NAME.fullmatch(item["file"]) and item["file"].endswith(".age"), "ARCHIVE_NAME_REJECTED")
    require(HEX.fullmatch(item["sha256"]) and type(item["bytes"]) is int and item["bytes"] > len(HEADER),
            "ARCHIVE_IDENTITY_REJECTED")
    p = private(Path(directory) / item["file"])
    require(p.stat().st_size == item["bytes"] and sha(p) == item["sha256"], "ARCHIVE_CHECKSUM_MISMATCH")
    with p.open("rb") as f:
        require(f.read(len(HEADER)) == HEADER, "ENCRYPTION_FORMAT_REJECTED")
    return p


def context(value):
    require(set(value) == {"sourceSha", "sourceTree", "imageDigest", "database", "databaseOid",
                           "postgresVersion", "ledgerHash", "schemaHash", "dataHash",
                           "recipientSha256", "custodyReceiptSha256", "offHostReceiptSha256",
                           "fenceGuardSha256", "metadataSqlSha256"}, "CONTEXT_FIELDS_REJECTED")
    require(SHA.fullmatch(value["sourceSha"]) and SHA.fullmatch(value["sourceTree"]), "SOURCE_IDENTITY_REJECTED")
    require(IMAGE.fullmatch(value["imageDigest"]), "IMAGE_IDENTITY_REJECTED")
    require(value["database"] == "beaconhs" and type(value["databaseOid"]) is int and value["databaseOid"] > 0
            and value["postgresVersion"] == "160015", "DATABASE_IDENTITY_REJECTED")
    for key in ("ledgerHash", "schemaHash", "dataHash", "recipientSha256", "custodyReceiptSha256",
                "offHostReceiptSha256", "fenceGuardSha256", "metadataSqlSha256"):
        require(isinstance(value[key], str) and HEX.fullmatch(value[key]), "CONTEXT_DIGEST_REJECTED")
    return value


def guard(executable, approved_hash):
    p = private(executable)
    require(sha(p) == approved_hash and os.access(p, os.X_OK), "FENCE_GUARD_IDENTITY_REJECTED")
    # The separately reviewed supervisor must continuously hold the fence.
    # Exit success is NOT interpreted as independent custody proof by this tool.
    run([str(p.resolve())], timeout=30)


def psql(sql):
    return run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
               input=sql.encode(), timeout=60).decode().strip()


def capture_pg(directory, recipient_file, ctx, guard_file, metadata_sql):
    directory = private(directory, True)
    ctx = context(ctx)
    require(os.environ.get("PGDATABASE") == ctx["database"], "PGDATABASE_REJECTED")
    require(os.environ.get("PGUSER") == "beaconhs_backup", "BACKUP_USER_REJECTED")
    require(os.environ.get("PGHOST") and os.environ.get("PGPORT"), "EXPLICIT_ENDPOINT_REQUIRED")
    sqlfile = private(metadata_sql)
    require(sha(sqlfile) == ctx["metadataSqlSha256"], "COLLECTOR_IDENTITY_REJECTED")
    rec = private(recipient_file).read_text().strip()
    require(hashlib.sha256(rec.encode()).hexdigest() == ctx["recipientSha256"], "RECIPIENT_IDENTITY_REJECTED")
    guard(guard_file, ctx["fenceGuardSha256"])
    state = json.loads(psql("""BEGIN READ ONLY;
SELECT json_build_object('database',current_database(),'oid',(SELECT oid FROM pg_database WHERE datname=current_database()),
'version',current_setting('server_version_num'),'role',current_user,'super',rolsuper,'bypass',rolbypassrls,
'readonly',current_setting('default_transaction_read_only')) FROM pg_roles WHERE rolname=current_user;
ROLLBACK;"""))
    require(state == {"database": ctx["database"], "oid": ctx["databaseOid"], "version": "160015",
                      "role": "beaconhs_backup", "super": False, "bypass": True, "readonly": "on"},
            "BACKUP_CONNECTION_REJECTED")
    require(run(["pg_dump", "--version"]).decode().split()[2] == "16.15", "PG_DUMP_VERSION_REJECTED")
    database_size = int(psql("SELECT pg_database_size(current_database());"))
    require(shutil.disk_usage(directory).free >= int((3 * database_size + 536870912) * 1.2),
            "CAPTURE_SPACE_INSUFFICIENT")
    started = {"createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "context": ctx,
               "databaseSizeBytes": database_size}
    write_new(directory / "capture-start.json", canonical(started))
    with tempfile.TemporaryDirectory(prefix=".capture-", dir=directory) as tmp:
        os.chmod(tmp, 0o700)
        dump = Path(tmp) / "database.dump"
        # Preserve owner/ACL entries; these are required for independent restoration.
        run(["pg_dump", "--format=custom", "--compress=9", "--serializable-deferrable",
             "--lock-wait-timeout=30s", "--file", str(dump)], timeout=1800)
        os.chmod(dump, 0o600)
        run(["pg_restore", "--list", str(dump)])
        raw = Path(tmp) / "metadata.jsonl"
        # PGOPTIONS forces read-only even if a reviewed collector unexpectedly contains writes.
        env_before = os.environ.get("PGOPTIONS")
        os.environ["PGOPTIONS"] = "-c default_transaction_read_only=on -c statement_timeout=60000"
        try:
            write_new(raw, run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", str(sqlfile)]))
        finally:
            if env_before is None:
                os.environ.pop("PGOPTIONS", None)
            else:
                os.environ["PGOPTIONS"] = env_before
        documents = [json.loads(line) for line in raw.read_text().splitlines() if line.strip()]
        require(len(documents) == 21, "METADATA_DOCUMENT_COUNT_REJECTED")
        guard(guard_file, ctx["fenceGuardSha256"])
        token = uuid.uuid4().hex
        items = []
        for kind, source, name in (("database", dump, f"beaconhs-{token}.dump.age"),
                                    ("metadata", raw, f"metadata-{token}.jsonl.age")):
            item = encrypt(source, recipient_file, directory / name)
            item["kind"] = kind
            items.append(item)
        guard(guard_file, ctx["fenceGuardSha256"])
    write_new(directory / "capture-complete.json", canonical({"components": items}))
    # Caller must seal all storage/queue/recovery components before finalisation.
    return items


def finalize(directory, ctx, items):
    directory = private(directory, True)
    context(ctx)
    require({x["kind"] for x in items} == REQUIRED and len(items) == len(REQUIRED),
            "INCOMPLETE_RECOVERY_SET")
    require(len({x["file"] for x in items}) == len(items), "DUPLICATE_ARCHIVE")
    for item in items:
        verify_file(directory, item)
    started = json.loads(private(directory / "capture-start.json").read_text())
    completed = json.loads(private(directory / "capture-complete.json").read_text())
    require(started["context"] == ctx, "CAPTURE_CONTEXT_MISMATCH")
    require(sorted(completed["components"], key=lambda x: x["kind"]) == sorted(
        [x for x in items if x["kind"] in {"database", "metadata"}], key=lambda x: x["kind"]),
        "CAPTURE_COMPONENT_MISMATCH")
    require(type(started["databaseSizeBytes"]) is int and started["databaseSizeBytes"] > 0,
            "DATABASE_SIZE_REJECTED")
    value = {"version": 1, "backupId": uuid.uuid4().hex,
             "databaseSizeBytes": started["databaseSizeBytes"],
             "createdAt": started["createdAt"],
             "context": ctx, "components": sorted(items, key=lambda x: x["kind"])}
    payload = canonical(value)
    digest = hashlib.sha256(payload).hexdigest()
    path = directory / f"manifest-{digest}.json"
    write_new(path, payload)
    return {"manifest": path.name, "sha256": digest}


def verify(directory, expected):
    require(HEX.fullmatch(expected), "MANIFEST_DIGEST_REQUIRED")
    directory = private(directory, True)
    path = private(directory / f"manifest-{expected}.json")
    require(sha(path) == expected, "MANIFEST_CHECKSUM_MISMATCH")
    value = json.loads(path.read_text())
    require(set(value) == {"version", "backupId", "createdAt", "databaseSizeBytes", "context", "components"}
            and value["version"] == 1, "MANIFEST_VERSION_REJECTED")
    require(re.fullmatch(r"[0-9a-f]{32}", value["backupId"]), "BACKUP_ID_REJECTED")
    context(value["context"])
    require(type(value["databaseSizeBytes"]) is int and value["databaseSizeBytes"] > 0, "DATABASE_SIZE_REJECTED")
    require(len(value["components"]) == 5 and {x["kind"] for x in value["components"]} == REQUIRED,
            "INCOMPLETE_RECOVERY_SET")
    require(len({x["file"] for x in value["components"]}) == 5, "DUPLICATE_ARCHIVE")
    for item in value["components"]:
        verify_file(directory, item)
    return value


def decrypt_component(directory, expected, kind, identity, destination):
    value = verify(directory, expected)
    identity = private(identity)
    item = next(x for x in value["components"] if x["kind"] == kind)
    source = Path(directory) / item["file"]
    destination = Path(destination)
    private(destination.parent, True)
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as out:
            run(["age", "--decrypt", "-i", str(identity), str(source)], output=out)
            out.flush()
            os.fsync(out.fileno())
    except Exception:
        # May contain partial plaintext. Remains private; never treated as verified.
        raise
    return destination


def compare_copies(first, second, expected):
    a, b = verify(first, expected), verify(second, expected)
    require(a == b, "COPY_MANIFEST_MISMATCH")
    return {"manifestSha256": expected, "allCiphertextChecksumsMatch": True,
            "offHostIndependence": "MUST_BE_VERIFIED_FROM_STORAGE_ACCOUNT_AND_HOST_IDENTITY"}


def gate_fragment(directory, expected, receipt, now=None):
    value = verify(directory, expected)
    ctx = value["context"]
    keys = {"manifestSha256", "restoredAt", "restoreRun", "ledgerHash", "schemaHash", "dataHash",
            "rollbackImageDigest", "sourceSha", "sourceTree", "imageDigest"}
    require(set(receipt) == keys and receipt["manifestSha256"] == expected, "RESTORE_RECEIPT_REJECTED")
    for key in ("sourceSha", "sourceTree", "imageDigest", "ledgerHash", "schemaHash", "dataHash"):
        require(receipt[key] == ctx[key], "RESTORE_BINDING_MISMATCH")
    require(IMAGE.fullmatch(receipt["rollbackImageDigest"]), "ROLLBACK_IMAGE_REJECTED")
    require(re.fullmatch(r"https://github.com/Satho82/beaconhs/actions/runs/[0-9]+", receipt["restoreRun"]),
            "RESTORE_RUN_REJECTED")
    created, restored = (dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
                         for s in (value["createdAt"], receipt["restoredAt"]))
    now = now or dt.datetime.now(dt.timezone.utc)
    require(created.tzinfo and restored.tzinfo and created <= restored <= now
            and dt.timedelta(0) <= now-created <= dt.timedelta(hours=1), "FRESH_RESTORE_REQUIRED")
    archive = next(x for x in value["components"] if x["kind"] == "database")
    require(archive["file"].endswith(".dump.age"), "GATE_DATABASE_ARCHIVE_NAME_REJECTED")
    return {"file": archive["file"], "sha256": archive["sha256"], "createdAt": value["createdAt"],
            "restoredAt": receipt["restoredAt"], "restoreRun": receipt["restoreRun"],
            "ledgerHash": ctx["ledgerHash"], "schemaHash": ctx["schemaHash"], "dataHash": ctx["dataHash"],
            "restoredLedgerHash": receipt["ledgerHash"], "restoredSchemaHash": receipt["schemaHash"],
            "restoredDataHash": receipt["dataHash"], "rollbackImageDigest": receipt["rollbackImageDigest"]}


def main():
    os.umask(0o077)
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("encrypt")
    for n in ("source", "recipient", "destination"): s.add_argument(n)
    s = sub.add_parser("capture-pg")
    for n in ("directory", "recipient", "context", "guard", "metadata_sql"): s.add_argument(n)
    s = sub.add_parser("finalize")
    for n in ("directory", "context", "components"): s.add_argument(n)
    s = sub.add_parser("verify")
    for n in ("directory", "manifest_sha256"): s.add_argument(n)
    s = sub.add_parser("decrypt")
    for n in ("directory", "manifest_sha256", "kind", "identity", "destination"): s.add_argument(n)
    s = sub.add_parser("compare-copies")
    for n in ("first", "second", "manifest_sha256"): s.add_argument(n)
    s = sub.add_parser("gate-fragment")
    for n in ("directory", "manifest_sha256", "receipt"): s.add_argument(n)
    a = p.parse_args()
    read = lambda name: json.loads(private(name).read_text())
    if a.command == "encrypt":
        result = encrypt(a.source, a.recipient, a.destination)
    elif a.command == "capture-pg":
        result = capture_pg(a.directory, a.recipient, read(a.context), a.guard, a.metadata_sql)
    elif a.command == "finalize":
        result = finalize(a.directory, read(a.context), read(a.components))
    elif a.command == "verify":
        verify(a.directory, a.manifest_sha256)
        result = {"verified": True, "manifestSha256": a.manifest_sha256}
    elif a.command == "decrypt":
        require(a.kind in COMPONENTS, "COMPONENT_KIND_REJECTED")
        decrypt_component(a.directory, a.manifest_sha256, a.kind, a.identity, a.destination)
        result = {"decrypted": True, "kind": a.kind}
    elif a.command == "compare-copies":
        result = compare_copies(a.first, a.second, a.manifest_sha256)
    else:
        result = gate_fragment(a.directory, a.manifest_sha256, read(a.receipt))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Never print subprocess output, SQL, connection details, paths or key material.
        code = str(e) if isinstance(e, Rejected) else "RECOVERY_OPERATION_FAILED"
        print(json.dumps({"error": code}), file=sys.stderr)
        sys.exit(1)
