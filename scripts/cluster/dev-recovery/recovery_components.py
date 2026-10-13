#!/usr/bin/env python3
"""Read-only recovery component capture. No source volume deletion or extraction."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import tempfile
import dev_recovery as r
import recovery_admission as admission

VOLUMES = ("uvanoo-decision149-restore-data", "uvanoo-decision154-clean-data",
           "uvanoo-decision155-clean-data", "uvanoo-clean155-redis-data")
MINIO = "uvanoo-dev-minio-data"

def tree_manifest(path):
    path = Path(path)
    r.require(path.is_dir() and not path.is_symlink(), "SOURCE_DIRECTORY_REJECTED")
    entries = []
    for parent, dirs, files in os.walk(path, followlinks=False):
        for name in sorted(dirs+files):
            p = Path(parent)/name
            s = p.lstat()
            r.require(stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode),
                      "SPECIAL_RECOVERY_FILE_REJECTED")
            entries.append({"path": str(p.relative_to(path)), "mode": stat.S_IMODE(s.st_mode),
                            "uid": s.st_uid, "gid": s.st_gid, "size": s.st_size,
                            "mtime_ns": s.st_mtime_ns,
                            "target": os.readlink(p) if p.is_symlink() else None,
                            "sha256": r.sha(p) if stat.S_ISREG(s.st_mode) else None})
    return sorted(entries, key=lambda x: x["path"])

def archive_sources(destination, sources, evidence):
    """Archive untouched offline trees; mutation before/during capture rejects promotion."""
    before = {label: tree_manifest(path) for label, path in sources.items()}
    r.write_new(destination, b"")
    with tarfile.open(destination, "w", dereference=False) as archive:
        for label, path in sorted(sources.items()):
            r.require(r.NAME.fullmatch(label), "ARCHIVE_LABEL_REJECTED")
            archive.add(path, arcname=label, recursive=True)
        payload = r.canonical({"sources": before, "evidence": evidence})
        import io
        info = tarfile.TarInfo("recovery-provenance.private.json")
        info.size, info.mode = len(payload), 0o600
        archive.addfile(info, io.BytesIO(payload))
    r.require(before == {label: tree_manifest(path) for label, path in sources.items()},
              "RECOVERY_SOURCE_CHANGED")
    return before

def volume_paths(names):
    result = {}
    for name in names:
        value = json.loads(r.run(["docker", "volume", "inspect", name]))[0]
        r.require(value["Name"] == name and value["Driver"] == "local" and
                  not value.get("Options"), "VOLUME_PROFILE_REJECTED")
        path = Path(value["Mountpoint"])
        r.require(path.is_absolute() and path.is_dir() and not path.is_symlink(),
                  "VOLUME_PATH_REJECTED")
        result[name] = str(path)
    return result

def no_mounted_writers(paths):
    ids = r.run(["docker", "ps", "-q"]).decode().split()
    if not ids: return
    for c in json.loads(r.run(["docker", "inspect"]+ids)):
        for mount in c.get("Mounts", []):
            source = mount.get("Source", "")
            for path in paths:
                a, b = Path(source), Path(path)
                overlaps = a == b or a in b.parents or b in a.parents
                r.require(not (source and overlaps and mount.get("RW")),
                          "RECOVERY_VOLUME_HAS_WRITER")

def capture_trees(kind, sources, directory, recipient, evidence, guard):
    guard()
    no_mounted_writers(sources.values())
    with tempfile.TemporaryDirectory(prefix="."+kind+"-", dir=directory) as tmp:
        os.chmod(tmp, 0o700)
        plain = Path(tmp)/"component.tar"
        archive_sources(plain, sources, evidence)
        guard()
        no_mounted_writers(sources.values())
        item = r.encrypt(plain, recipient, Path(directory)/(kind+".tar.age"))
    return dict(item, kind=kind)

def redis_query(container, *args):
    return r.run(["docker", "exec", container, "redis-cli", "--json"]+list(args))

def redis_raw(container, *args):
    value = r.run(["docker", "exec", container, "redis-cli", "--raw"]+list(args)).decode()
    r.require(not value.startswith(("NOAUTH", "WRONGPASS", "ERR ", "(error)")), "REDIS_AUTH_OR_COMMAND_REJECTED")
    return value

def capture_redis(container, directory, recipient, guard):
    """SYNC snapshot streams to host; original Redis filesystem and queues are untouched."""
    guard()
    info = json.loads(r.run(["docker", "inspect", container]))[0]
    r.require(info["Name"] == "/uvanoo-dev-redis" and info["State"]["Running"] and
              not info["HostConfig"].get("PortBindings"), "REDIS_IDENTITY_REJECTED")
    config = json.loads(redis_query(container, "CONFIG", "GET", "dir", "dbfilename",
                                   "appendonly", "appenddirname", "appendfilename", "save"))
    r.require(isinstance(config, (dict, list)), "REDIS_CONFIG_REJECTED")
    before = redis_raw(container, "INFO", "keyspace").strip()
    r.require(before.startswith("# Keyspace"), "REDIS_KEYSPACE_FORMAT_REJECTED")
    with tempfile.TemporaryDirectory(prefix=".redis-", dir=directory) as tmp:
        os.chmod(tmp, 0o700)
        tmp = Path(tmp)
        r.write_new(tmp/"redis.rdb", b"")
        with (tmp/"redis.rdb").open("wb") as out:
            r.run(["docker", "exec", container, "redis-cli", "--rdb", "-"],
                  output=out, timeout=900)
        with (tmp/"redis.rdb").open("rb") as stream:
            r.require(stream.read(5) == b"REDIS", "REDIS_SNAPSHOT_FORMAT_REJECTED")
        # Redis' matching validator checks internal CRC; stdin via /dev/stdin stays read-only.
        with (tmp/"redis.rdb").open("rb") as stream:
            p = subprocess.run(["docker", "run", "--rm", "--network", "none", "--read-only",
                               "--memory", "256m", "--cpus", "0.5", "--pids-limit", "32",
                               "--label", "uvanoo.recovery=redis-validation", "--mount",
                               "type=bind,src="+str(tmp/"redis.rdb")+",dst=/snapshot.rdb,readonly",
                               info["Image"], "redis-check-rdb", "/snapshot.rdb"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=900)
        r.require(p.returncode == 0, "REDIS_SNAPSHOT_INTEGRITY_REJECTED")
        after = redis_raw(container, "INFO", "keyspace").strip()
        r.require(before == after, "REDIS_KEYSPACE_CHANGED")
        provenance = {"containerId": info["Id"], "imageId": info["Image"],
                      "mounts": info["Mounts"], "config": config, "keyspace": before,
                      "snapshotSha256": r.sha(tmp/"redis.rdb"),
                      "queueReplay": False, "originalPersistencePreserved": True}
        r.write_new(tmp/"redis-provenance.private.json", r.canonical(provenance))
        # Separate output from input directory: never recursively archive itself.
        plain = Path(directory)/("."+tmp.name+".tar")
        archive_sources(plain, {"redis": tmp}, provenance)
        try:
            guard()
            item = r.encrypt(plain, recipient, Path(directory)/"redis.tar.age")
        finally:
            plain.unlink()  # Only this invocation's temporary plaintext archive.
    return dict(item, kind="redis")

def check_custody(directory, digest, receipt):
    manifest = r.verify(directory, digest)
    r.require(set(receipt) == {"manifestSha256", "location", "verifiedAt", "allChecksumsMatch",
                              "independentHost", "attestedBy", "hostSha256"},
              "CUSTODY_RECEIPT_FIELDS_REJECTED")
    r.require(receipt['allChecksumsMatch'] is True and receipt['independentHost'] is True,
              'OFF_VPS_CUSTODY_NOT_CONFIRMED')
    approved = admission.policy(directory, fresh=False)
    r.require(r.sha(Path(directory)/admission.POLICY) == manifest['context']['offHostReceiptSha256']
              and approved['keyReceiptSha256'] == manifest['context']['custodyReceiptSha256']
              and approved['recipientSha256'] == manifest['context']['recipientSha256'],
              'CAPTURE_POLICY_BINDING_REJECTED')
    r.require(receipt["manifestSha256"] == digest and receipt["allChecksumsMatch"] is True and
              receipt["independentHost"] is True and receipt["location"] == approved['destinationId'] and
              receipt['hostSha256'] == approved['restoreHostSha256'] and
              isinstance(receipt["attestedBy"], str) and bool(receipt["attestedBy"]),
              "OFF_VPS_CUSTODY_NOT_CONFIRMED")
    import datetime as dt
    created = dt.datetime.fromisoformat(manifest["createdAt"].replace("Z", "+00:00"))
    verified = dt.datetime.fromisoformat(receipt["verifiedAt"].replace("Z", "+00:00"))
    r.require(created.tzinfo and verified.tzinfo and
              created <= verified <= dt.datetime.now(dt.timezone.utc), "CUSTODY_TIME_REJECTED")
    return receipt

def custody(directory, digest, receipt):
    check_custody(directory, digest, receipt)
    # This is an explicit owner attestation, not a claim of remote machine inspection.
    r.write_new(Path(directory)/"off-vps-custody.private.json", r.canonical(receipt))
    return {"manifestSha256": digest, "custody": "OWNER_ATTESTED",
            "receiptSha256": r.sha(Path(directory)/"off-vps-custody.private.json")}
