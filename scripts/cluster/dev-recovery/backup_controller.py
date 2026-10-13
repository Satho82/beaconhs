#!/usr/bin/env python3
"""Explicit SSH-only DEV backup orchestration. No deployment or live migration entrypoint."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import threading
import tempfile
import time
import dev_recovery as r
import backup_fence as f
import recovery_components as components
import pg16_client
import restore_disposable

PG = "uvanoo-dev-postgres"
REDIS = "uvanoo-dev-redis"
SOURCE = "6976a851c18e879df1813bb7c18729d6da5ab846"
TREE = "3522b5c07b3f2b1b2a43383d8e3bc49c66cc4080"
DIGEST = "sha256:a043f96d8c6b453d9df3e4b38b402963e6e3c0705c4ffb1aed19d6566cdfbec3"
RECIPIENT = "138aa3b6a8f40c219b5d69a30357cf5ac9971c9523c87c04e42fc43c5434727f"
ROOT = Path(__file__).resolve().parents[3]

def read(path):
    return json.loads(r.private(path).read_text())

def cli_json(args):
    return json.loads(r.run(args))

def client_setup(work):
    directory = Path(tempfile.mkdtemp(prefix="clients-", dir=work))
    os.chmod(directory, 0o700)
    bridge = Path(__file__).with_name("pg16_client.py")
    for name in ("psql", "pg_dump", "pg_restore"):
        script = "#!/bin/sh\nexec "+shlex.quote(sys.executable)+" "+shlex.quote(str(bridge))+" "+name+' "$@"\n'
        r.write_new(directory/name, script.encode())
        os.chmod(directory/name, 0o700)
    os.environ.update(PATH=str(directory)+":"+os.environ["PATH"], UVANOO_PG_CONTAINER=PG,
                      PGHOST="/var/run/postgresql", PGPORT="5432",
                      PGUSER="beaconhs_backup", PGDATABASE="beaconhs")

def containers():
    ids = r.run(["docker", "ps", "-aq"]).decode().split()
    return {c["Id"]: c for c in cli_json(["docker", "inspect"]+ids)} if ids else {}

def fixed_container(c):
    return {k: c[k] for k in ("Id", "Image", "Config", "HostConfig", "Mounts")}

def probe(snapshot, drained):
    pg16_client.checked_container(PG)
    live = containers()
    server = next(c for c in live.values() if c["Name"] == "/"+PG)
    previous_server = snapshot.get(server["Id"])
    r.require(previous_server and previous_server["State"]["Pid"] == server["State"]["Pid"],
              "SERVER_PROCESS_CHANGED")
    # Service task replacements are covered by service specs and actual task states.
    # Non-service containers may not appear/disappear or change config during capture.
    def ordinary(values):
        return {cid: fixed_container(c) for cid, c in values.items()
                if not c["Config"].get("Labels", {}).get("com.docker.swarm.service.id")
                and c["Config"].get("Labels", {}).get("uvanoo.recovery") != "redis-validation"
                and not pg16_client.is_client(c, server)}
    r.require(ordinary(live) == ordinary(snapshot), "NON_SERVICE_CONTAINER_DRIFT")
    for c in live.values():
        if c["Name"] in ("/uvanoo-decision155-inspect", "/uvanoo-clean155-redis"):
            r.require(not c["State"]["Running"], "RECOVERY_CONTAINER_RUNNING")
    if not drained: return
    # Only our socket-local read-only backup sessions may coexist with this probe.
    count = r.psql("""SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
AND backend_type='client backend' AND pid<>pg_backend_pid()
AND NOT (usename='beaconhs_backup' AND application_name='uvanoo-protected-backup'
AND client_addr IS NULL);""")
    r.require(count == "0", "EXTERNAL_DATABASE_CLIENT")
    text = components.redis_raw(REDIS, "CLIENT", "LIST")
    r.require(text.startswith("id="), "REDIS_CLIENTS_REJECTED")
    for line in text.splitlines():
        fields = dict(part.split("=", 1) for part in line.split() if "=" in part)
        own = fields.get("cmd") in ("client|list", "client") and fields.get("addr", "").startswith("127.0.0.1:")
        snapshot_client = fields.get("cmd") in ("sync", "psync") and fields.get("addr", "").startswith("127.0.0.1:")
        r.require(own or snapshot_client, "EXTERNAL_REDIS_CLIENT")
    paths = components.volume_paths((components.MINIO,)+components.VOLUMES)
    components.no_mounted_writers(paths.values())

def identity(services):
    selected = f.select(services)
    for role in ("web", "worker"):
        image = services[selected[role]]["Spec"]["TaskTemplate"]["ContainerSpec"]["Image"]
        r.require(image.endswith("@"+DIGEST), "CURRENT_APPLICATION_IMAGE_CHANGED")
        labels = cli_json(["docker", "image", "inspect", image])[0]["Config"].get("Labels", {})
        r.require(labels.get("org.opencontainers.image.revision") == SOURCE,
                  "CURRENT_APPLICATION_SOURCE_CHANGED")
    # SOURCE/TREE pair independently recovered from GitHub commit object. This is
    # recovery provenance, NOT the future product candidate image.
    return {"sourceSha": SOURCE, "sourceTree": TREE, "imageDigest": DIGEST}

def metadata_and_data(work, collector):
    raw = r.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", str(collector)])
    docs = r.parse_documents(raw.decode())
    journal = json.loads((ROOT/"packages/db/drizzle/meta/_journal.json").read_text())["entries"]
    rows = docs[1]["rows"]
    r.require(len(rows) == 58, "LIVE_LEDGER_NOT_58")
    previous = 0
    for row, entry in zip(rows, journal[:58]):
        sql = ROOT/"packages/db/drizzle"/(entry["tag"]+".sql")
        r.require(type(row["id"]) is int and row["id"] > previous and
                  row["hash"] == r.sha(sql) and int(row["created_at"]) == entry["when"],
                  "LIVE_LEDGER_IDENTITY_MISMATCH")
        previous = row["id"]
    tables = json.loads(r.psql("""SELECT coalesce(json_agg(x ORDER BY nspname,relname),'[]') FROM
(SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','m') AND n.nspname NOT LIKE 'pg_%'
AND n.nspname NOT IN ('information_schema','drizzle')) x;"""))
    result = []
    quote = lambda name: '"'+name.replace('"','""')+'"'
    for table in tables:
        relation = quote(table["nspname"])+"."+quote(table["relname"])
        values = json.loads(r.psql("SELECT json_agg(x) FROM (SELECT count(*)::text count,"
                 "md5(coalesce(string_agg(h,'' ORDER BY h),'')) hash FROM "
                 "(SELECT md5(to_jsonb(t)::text) h FROM "+relation+" t) q) x;"))
        result.append([table["nspname"], table["relname"], values])
    seq = json.loads(r.psql("""SELECT coalesce(json_agg(x ORDER BY schemaname,sequencename),'[]') FROM
(SELECT schemaname,sequencename,last_value::text FROM pg_sequences
WHERE schemaname NOT LIKE 'pg_%') x;"""))
    result.append(["sequences", seq])
    hashes = json.loads(r.run(["node", str(Path(__file__).with_name("backup_fingerprint.mjs"))],
                             input=r.canonical({"metadata": raw.decode(), "data": result})))
    return hashes, raw

def guard_state(work):
    state = read(work/"fence-state.private.json")
    api = f.Docker()
    fence = f.Fence(api, state["baseline"], state["window"], lambda *_: None)
    fence.owned = state["owned"]
    r.require(not (work/"capture-invalid.private.json").exists(), "CAPTURE_INVALIDATED")
    fence.verify(lambda drained: probe(state["containers"], drained))

def capture(work, window_file):
    r.require(os.geteuid() == 0, "OWNER_SUDO_SSH_REQUIRED")
    work = r.private(work, True)
    # Never permits a duplicate or abandoned capture to restart under the same directory.
    lock = os.open(work/"operation.lock", os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
    client_setup(work)
    receipt = f.window(read(window_file))
    collector = work/"collector.sql"
    r.write_new(collector, (ROOT/"docs/v1.4/drift-resolution58-validation/export-metadata.sql").read_bytes())
    recipient = work/"recipient"
    r.require(hashlib.sha256(r.private(recipient).read_text().strip().encode()).hexdigest() == RECIPIENT,
              "APPROVED_RECIPIENT_MISMATCH")
    # Existing independently verified key custody is retained; this is not a new key check.
    custody = {"status": "OWNER_CONFIRMED", "recipientSha256": RECIPIENT,
               "identityOutsideVPS": True, "evidence": "owner-confirmed-age-key-custody"}
    offhost = {"status": "PLANNED_NOT_CAPTURED", "destination": "owner-independent-Mac",
               "archiveCustodyRequiredBeforeRehearsal": True}
    r.write_new(work/"key-custody.private.json", r.canonical(custody))
    r.write_new(work/"offhost-plan.private.json", r.canonical(offhost))
    baseline = f.Docker().services()
    source = identity(baseline)
    snapshot = containers()
    r.require(r.run(["node", "--version"]).decode().startswith("v24."), "NODE_24_REQUIRED")
    r.run(["age", "--version"])
    pg16_client.checked_container(PG)  # Preserve the specific rejection before subprocess wrapping.
    r.require(r.run(["pg_dump", "--version"]).decode().split()[2] == "16.15", "CLIENT_VERSION_REJECTED")
    r.require(r.psql("SHOW server_version_num;") == "160015", "SERVER_VERSION_REJECTED")
    permissions = r.psql("""SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
AND ((c.relkind IN ('r','m') AND NOT has_table_privilege(current_user,c.oid,'SELECT'))
OR (c.relkind='S' AND NOT has_sequence_privilege(current_user,c.oid,'SELECT'))
OR NOT has_schema_privilege(current_user,n.oid,'USAGE'));""")
    r.require(permissions == "0", "BACKUP_READ_PRIVILEGES_MISSING")
    # Enough for all retained offline recovery trees plus dump/restore headroom.
    paths = components.volume_paths((components.MINIO,)+components.VOLUMES)
    size = sum(sum(x["size"] for x in components.tree_manifest(p)) for p in paths.values())
    r.require(shutil.disk_usage(work).free >= size*4+3*1024**3, "RECOVERY_SPACE_INSUFFICIENT")
    journal_dir = work/"journal"
    journal_dir.mkdir(mode=0o700)
    sequence = 0
    def journal(name, value):
        nonlocal sequence
        sequence += 1
        r.write_new(journal_dir/(str(sequence).zfill(6)+"-"+name+".private.json"),
                    r.canonical({"event": name, "value": value}))
    r.write_new(work/"preflight-state.private.json", r.canonical(
        {"baseline": baseline, "window": receipt, "containers": snapshot}))
    fence = f.Fence(f.Docker(), baseline, receipt, journal)
    finished = threading.Event()
    failure = []
    monitor = None
    try:
        fence.acquire(lambda drained: probe(snapshot, drained))
        r.write_new(work/"fence-state.private.json",
                    r.canonical({"baseline": baseline, "owned": fence.owned,
                                 "window": receipt, "containers": snapshot}))
        guard = work/"guard"
        command = "#!/bin/sh\nexec "+shlex.quote(sys.executable)+" "+shlex.quote(str(Path(__file__).resolve()))+" guard "+shlex.quote(str(work))+"\n"
        r.write_new(guard, command.encode())
        os.chmod(guard, 0o700)
        def watch():
            while not finished.wait(2):
                try:
                    guard_state(work)
                except Exception:
                    failure.append(True)
                    r.write_new(work/"capture-invalid.private.json", r.canonical(
                        {"status": "INVALID", "reason": "FENCE_MONITOR_FAILED"}))
                    break
        monitor = threading.Thread(target=watch, daemon=True)
        monitor.start()
        before, raw = metadata_and_data(work, collector)
        ctx = dict(source, database="beaconhs", postgresVersion="160015",
                   **{k: before[k] for k in ("databaseOid", "ledgerHash", "schemaHash", "dataHash")},
                   recipientSha256=RECIPIENT, custodyReceiptSha256=r.sha(work/"key-custody.private.json"),
                   offHostReceiptSha256=r.sha(work/"offhost-plan.private.json"),
                   fenceGuardSha256=r.sha(guard), metadataSqlSha256=r.sha(collector))
        r.write_new(work/"context.private.json", r.canonical(ctx))
        r.write_new(work/"before.private.jsonl", raw)
        items = r.capture_pg(work, recipient, ctx, guard, collector)
        check = lambda: guard_state(work)
        items.append(components.capture_trees("storage", {components.MINIO: paths[components.MINIO]},
                     work, recipient, {"attachmentReferences": "included in database dump; object verification required on restore"}, check))
        items.append(components.capture_redis(REDIS, work, recipient, check))
        recovery_paths = {name: paths[name] for name in components.VOLUMES}
        copy = Path("/var/lib/uvanoo-recovery/decision155-copy")
        r.require(copy.is_dir() and not copy.is_symlink(), "DECISION155_COPY_MISSING")
        recovery_paths["decision155-inspection-copy"] = str(copy)
        items.append(components.capture_trees("clean155", recovery_paths, work, recipient,
                     {"originalVolumesPreserved": True, "inspectionContainerNotRestarted": True}, check))
        after, _ = metadata_and_data(work, collector)
        r.require(before == after and not failure, "CAPTURE_STATE_CHANGED")
        check()
        sealed = r.finalize(work, ctx, items)
        # A final fence check is mandatory even after bytes were sealed.
        check()
        r.verify(work, sealed["sha256"])
        r.write_new(work/"capture-valid.private.json", r.canonical(sealed))
        finished.set()
        monitor.join(timeout=25)
        r.require(not monitor.is_alive() and not failure, "MONITOR_NOT_CLOSED")
        fence.restore(lambda drained: probe(snapshot, drained))
        r.write_new(work/"safe-closure.private.json", r.canonical(
                    {"liveSQLChanged": False, "migrationCount": 58, "originalSpecsRestored": True,
                     "captureAccepted": True}))
        return sealed
    except Exception:
        finished.set()
        if monitor: monitor.join(timeout=25)
        # No automatic un-fence on uncertain state. Existing evidence and original replicas survive.
        fence.refence_owned()
        raise
    finally:
        os.close(lock)

def replay_owned(events):
    owned, uncertain = {}, set()
    for event in events:
        name, value = event["event"], event["value"]
        if name.startswith(("replica-intent-", "restore-intent-")):
            uncertain.add(value["id"])
        elif name.startswith(("replica-fenced-", "restored-")):
            owned[value["ID"]] = value
            uncertain.discard(value["ID"])
        elif name == "failure-refence":
            owned.update(value["owned"])
            uncertain.update(value["unverifiedServiceIds"])
    r.require(not uncertain, "UNCONFIRMED_MUTATION_REQUIRES_MANUAL_REVIEW")
    r.require(owned, "NO_CONFIRMED_FENCE_TO_RESTORE")
    return owned

def recover(work, window_file):
    r.require(os.geteuid() == 0, "OWNER_SUDO_SSH_REQUIRED")
    # The capture lock is retained on disk. Its advisory lock proves no adapter
    # process still owns this recovery directory; it does not replace the operator window.
    descriptor = os.open(work/"operation.lock", os.O_RDWR|os.O_NOFOLLOW)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX|fcntl.LOCK_NB)
        r.require(not (work/"safe-closure.private.json").exists(), "ALREADY_RESTORED")
        state = read(work/"preflight-state.private.json")
        events = [read(path) for path in sorted((work/"journal").glob("*.private.json"))]
        for directory in sorted(work.glob("recovery-*")):
            r.private(directory, True)
            events.extend(read(path) for path in sorted(directory.glob("*.private.json")))
        owned = replay_owned(events)
        client_setup(work)
        active = r.psql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                       "AND backend_type='client backend' AND pid<>pg_backend_pid();")
        r.require(active == "0", "RECOVERY_DATABASE_OPERATION_STILL_ACTIVE")
        redis_clients = components.redis_raw(REDIS, "CLIENT", "LIST")
        r.require(not any("cmd=sync" in line or "cmd=psync" in line
                          for line in redis_clients.splitlines()), "REDIS_CAPTURE_STILL_ACTIVE")
        r.require(r.psql("SELECT count(*) FROM drizzle.__drizzle_migrations;") == "58",
                  "LIVE_LEDGER_CHANGED_DO_NOT_RESUME")
        recovery_log = work/("recovery-"+str(time.time_ns()))
        recovery_log.mkdir(mode=0o700)
        sequence = 0
        def journal(name, value):
            nonlocal sequence
            sequence += 1
            r.write_new(recovery_log/(str(sequence).zfill(6)+"-"+name+".private.json"),
                        r.canonical({"event": name, "value": value}))
        fence = f.Fence(f.Docker(), state["baseline"], f.window(read(window_file)), journal)
        fence.owned = owned
        fence.restore(lambda drained: probe(state["containers"], drained))
        r.write_new(work/"safe-closure.private.json",
                    r.canonical({"originalSpecsRestored": True, "captureAccepted": False,
                                 "liveSQLChanged": False, "manualRecovery": True}))
        return {"originalSpecsRestored": True, "captureAccepted": False}
    finally:
        os.close(descriptor)

def transfer(work, digest, destination):
    work = r.private(work, True)
    r.require(read(work/"safe-closure.private.json").get("captureAccepted") is True,
              "CAPTURE_NOT_ACCEPTED_AFTER_RECOVERY")
    r.require(not (work/"capture-invalid.private.json").exists(), "INVALID_CAPTURE")
    r.require(read(work/"capture-valid.private.json")["sha256"] == digest, "CAPTURE_NOT_VALIDATED")
    manifest = r.verify(work, digest)
    destination = Path(destination)
    destination.mkdir(mode=0o700)
    files = [x["file"] for x in manifest["components"]]+["manifest-"+digest+".json"]
    for name in files:
        r.write_new(destination/name, (work/name).read_bytes())
    r.write_new(destination/"SHA256SUMS", "".join(r.sha(destination/n)+"  "+n+"\n" for n in files).encode())
    return {"files": files, "manifestSha256": digest, "custody": "NOT_YET_CONFIRMED"}

def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("capture", "guard", "transfer", "custody", "restore", "recover"))
    parser.add_argument("work")
    parser.add_argument("arguments", nargs="*")
    a = parser.parse_args()
    work = r.private(a.work, True)
    if a.command == "capture":
        result = capture(work, a.arguments[0])
    elif a.command == "recover":
        result = recover(work, a.arguments[0])
    elif a.command == "guard":
        guard_state(work)
        result = {"fence": "VERIFIED"}
    elif a.command == "transfer":
        result = transfer(work, *a.arguments)
    elif a.command == "custody":
        result = components.custody(work, a.arguments[0], read(a.arguments[1]))
    else:
        digest, identity_file, parent, roles, roles_sha = a.arguments
        receipt = read(work/"off-vps-custody.private.json")
        components.check_custody(work, digest, receipt)
        r.require(not (work/"capture-invalid.private.json").exists(), "INVALID_CAPTURE")
        r.require(read(work/"safe-closure.private.json").get("captureAccepted") is True,
                  "CAPTURE_NOT_ACCEPTED")
        # The existing restore helper creates its own fresh network-none destination.
        # Host pg_restore adapter remains bound to the pinned permanent client image;
        # it only lists an archive and has no write path.
        client_setup(work)
        result = restore_disposable.restore(work, digest, identity_file, parent, roles, roles_sha)
    print(json.dumps(result))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc) if isinstance(exc, r.Rejected)
                          else "ADAPTER_OPERATION_FAILED", "manualReviewRequired": True}), file=sys.stderr)
        sys.exit(1)
