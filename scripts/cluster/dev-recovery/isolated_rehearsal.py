#!/usr/bin/env python3
"""Only fresh manifest-labelled, network-none restores can reach SQL/rehearsal paths."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import backup_controller as controller
import dev_recovery as r
import pg16_client
import recovery_components as components

PRODUCT = "563fb0e9b79a838a5f394abaffb2f7dc743fc571"
TREE = "324c50a60e2cb0639ba920488a150c6531968374"
CANONICAL58 = "730d95c22ad6914d68bcdbea46283741f24ebd21a5f609c7951a4e5f72392a7c"
OBSERVED58 = "0529262d8f4b1a323994e1dbeae85e70b3506cd0746c2faf3d0b4e014ccb0074"
CORRECTION_SHA = "7262d5c6a52d5c57f1888837eabb44e3b29fa43f253ccc1086f888d46fbe9d54"

def target(receipt, digest, inspect=None):
    name = receipt["container"]
    r.require(re.fullmatch(r"uvanoo-restore-[0-9a-f]{32}", name), "ISOLATED_NAME_REQUIRED")
    r.require(receipt["manifestSha256"] == digest and receipt["archiveRestore"] == "PASS",
              "RESTORE_RECEIPT_REQUIRED")
    inspect = inspect or (lambda args: json.loads(r.run(args)))
    c = inspect(["docker", "inspect", name])[0]
    r.require(c["HostConfig"]["NetworkMode"] == "none" and not c["HostConfig"].get("PortBindings")
              and not c["HostConfig"].get("Privileged") and
              c["Config"]["Labels"].get("uvanoo.recovery") == "disposable" and
              c["Config"]["Labels"].get("uvanoo.manifest") == digest and
              len(c["Mounts"]) == 1 and c["Mounts"][0]["Source"] ==
              str(Path(receipt["workDirectory"])/"pgdata") and
              c["Mounts"][0]["Destination"] == "/var/lib/postgresql/data",
              "RESTORE_ISOLATION_REJECTED")
    pg16_client.checked_container(name, inspect)
    return c["Id"]

def sql(container, text):
    return r.run(["docker", "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
                  "-v", "ON_ERROR_STOP=1", "-U", "uvanoo_dev", "-d", "beaconhs"],
                 input=text.encode(), timeout=120)

def verify58(work, digest, receipt):
    manifest = r.verify(work, digest)
    components.check_custody(work, digest, controller.read(work/"off-vps-custody.private.json"))
    target(receipt, digest)
    controller.client_setup(work)
    os.environ["UVANOO_PG_CONTAINER"] = receipt["container"]
    actual, _ = controller.metadata_and_data(work, work/"collector.sql")
    expected = manifest["context"]
    r.require(all(actual[k] == expected[k] for k in ("ledgerHash", "schemaHash", "dataHash")),
              "RESTORED_LEDGER_SCHEMA_DATA_MISMATCH")
    result = {"manifestSha256": digest, "ledgerEntries": 58, "schemaSections": 19,
              "ledgerHash": actual["ledgerHash"], "schemaHash": actual["schemaHash"],
              "dataHash": actual["dataHash"], "restoredDatabaseOid": actual["databaseOid"],
              "verified": True}
    destination = Path(receipt["workDirectory"])/"verified58.private.json"
    r.write_new(destination, r.canonical(result))
    return result

def correct_copy(work, digest, receipt):
    target(receipt, digest)
    verified = controller.read(Path(receipt["workDirectory"])/"verified58.private.json")
    r.require(verified["manifestSha256"] == digest and verified["verified"] is True and
              verified["schemaHash"] == OBSERVED58, "EXACT_RESTORED_DRIFT_REQUIRED")
    # Caller must designate a second restore; a separate pristine restore receipt is required.
    pristine = controller.read(work/"pristine-restore.private.json")
    target(pristine, digest)
    r.require(pristine["container"] != receipt["container"], "PRISTINE_RESTORE_MUST_BE_RETAINED")
    pristine_verified = controller.read(Path(pristine["workDirectory"])/"verified58.private.json")
    r.require(pristine_verified["manifestSha256"] == digest and pristine_verified["verified"] is True,
              "PRISTINE_VERIFICATION_REQUIRED")
    correction = controller.ROOT/"docs/v1.4/drift-resolution58-validation/proposed-default-acl-correction.sql"
    r.require(r.sha(correction) == CORRECTION_SHA, "CORRECTION_SOURCE_REJECTED")
    before, _ = controller.metadata_and_data(work, work/"collector.sql")
    r.require(before["schemaHash"] == OBSERVED58 and
              before["ledgerHash"] == verified["ledgerHash"] and
              before["dataHash"] == verified["dataHash"], "RESTORE_CHANGED_BEFORE_CORRECTION")
    target(receipt, digest)
    sql(receipt["container"], "BEGIN;\n"+correction.read_text()+"\nCOMMIT;")
    after, _ = controller.metadata_and_data(work, work/"collector.sql")
    r.require(after["schemaHash"] == CANONICAL58 and
              after["ledgerHash"] == before["ledgerHash"] and after["dataHash"] == before["dataHash"],
              "ISOLATED_CORRECTION_CONTRACT_FAILED")
    result = dict(after, correctionSha256=CORRECTION_SHA, isolatedOnly=True)
    r.write_new(Path(receipt["workDirectory"])/"corrected58.private.json", r.canonical(result))
    return result

def migration_binding(evidence, image):
    r.require(re.fullmatch(r"[a-z0-9./_-]+@sha256:[0-9a-f]{64}", image),
              "IMMUTABLE_REHEARSAL_IMAGE_REQUIRED")
    r.require(evidence.get("sourceSha") == PRODUCT and evidence.get("sourceTree") == TREE and
              evidence.get("imageDigest") == image.split("@")[1] and evidence.get("version") == 1,
              "REHEARSAL_SOURCE_IMAGE_EVIDENCE_REQUIRED")
    # The unchanged migration gate performs complete freshness, schema, ledger, data,
    # backup, source, image and rollback checks inside the isolated runner.
    r.require(evidence.get("schemas", {}).get("58") == CANONICAL58 and
              re.fullmatch(r"https://github.com/Satho82/beaconhs/actions/runs/[0-9]+",
                           evidence.get("backup", {}).get("restoreRun", "")),
              "CORRECTED_BACKUP_RESTORE_GATE_EVIDENCE_REQUIRED")

def rehearse(work, digest, receipt, image, evidence_path):
    target(receipt, digest)
    corrected = controller.read(Path(receipt["workDirectory"])/"corrected58.private.json")
    r.require(corrected["schemaHash"] == CANONICAL58, "CORRECTED_CANONICAL58_REQUIRED")
    evidence_path = r.private(evidence_path)
    evidence = controller.read(evidence_path)
    migration_binding(evidence, image)
    r.require(evidence["database"] == "beaconhs" and
              evidence["databaseOid"] == corrected["databaseOid"] and
              evidence["postgresVersion"] == "160015", "RESTORED_DATABASE_BINDING_REQUIRED")
    archive_name = evidence.get("backup", {}).get("file", "")
    r.require(re.fullmatch(r"[a-zA-Z0-9_-]+\\.dump\\.age", archive_name), "BACKUP_ARCHIVE_NAME_REJECTED")
    archive = r.private(evidence_path.parent/archive_name)
    r.require(r.sha(archive) == evidence["backup"]["sha256"], "BACKUP_ARCHIVE_CHECKSUM_REJECTED")
    with archive.open("rb") as stream:
        r.require(stream.read(len(r.HEADER)) == r.HEADER, "BACKUP_ARCHIVE_FORMAT_REJECTED")
    image_info = json.loads(r.run(["docker", "image", "inspect", image]))[0]
    labels = image_info["Config"].get("Labels", {})
    r.require(labels.get("org.opencontainers.image.revision") == PRODUCT and
              labels.get("org.opencontainers.image.source") == "https://github.com/Satho82/beaconhs",
              "REHEARSAL_IMAGE_PROVENANCE_REQUIRED")
    # Image must contain the verified clean /workspace checkout, git, Node24,
    # frozen dependencies and tsx. The web runtime image does not provide these.
    # No build/install/network access is attempted with confidential data mounted.
    roles = {"MIGRATION_DATABASE_URL": "beaconhs_migrator", "DATABASE_URL": "beaconhs_app",
             "SUPERADMIN_DATABASE_URL": "beaconhs_super", "DEV_BACKUP_DATABASE_URL": "beaconhs_backup"}
    environment = os.environ.copy()
    for key, role in roles.items():
        password = secrets.token_hex(32)
        target(receipt, digest)
        sql(receipt["container"], "ALTER ROLE "+role+" PASSWORD '"+password+"';")
        environment[key] = "postgresql://"+role+":"+password+"@127.0.0.1:5432/beaconhs"
    environment.update(FEATURE_CANDIDATE_VERIFIED="true", APP_VERSION=PRODUCT,
                       DEV_RELEASE_EVIDENCE_PATH="/evidence/release.json",
                       DEV_RELEASE_EVIDENCE_SHA256=r.sha(evidence_path),
                       DEPLOY_SOURCE_SHA=PRODUCT, IMAGE_DIGEST=image.split("@")[1])
    command = ["docker", "run", "--name", "uvanoo-rehearsal-"+secrets.token_hex(16),
               "--network", "container:"+receipt["container"], "--read-only",
               "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
               "--security-opt", "no-new-privileges", "--memory", "2g", "--cpus", "1",
               "--pids-limit", "128", "--label", "uvanoo.recovery=isolated-rehearsal",
               "--mount", "type=bind,src="+str(evidence_path)+",dst=/evidence/release.json,readonly",
               "--mount", "type=bind,src="+str(archive)+",dst=/evidence/"+archive_name+",readonly"]
    for key in list(roles)+["FEATURE_CANDIDATE_VERIFIED","APP_VERSION","DEV_RELEASE_EVIDENCE_PATH",
                            "DEV_RELEASE_EVIDENCE_SHA256","DEPLOY_SOURCE_SHA","IMAGE_DIGEST"]:
        command += ["-e", key]
    command += ["--workdir", "/workspace", "--entrypoint", "node", image,
                "node_modules/tsx/dist/cli.mjs", "packages/db/src/migrate.ts"]
    log = Path(receipt["workDirectory"])/"migration.private.log"
    r.write_new(log, b"")
    with log.open("wb") as output:
        result = subprocess.run(command, env=environment, stdout=output, stderr=output, timeout=1800)
    r.require(result.returncode == 0, "ISOLATED_MIGRATION_FAILED_RETAIN_LOG")
    target(receipt, digest)
    count = sql(receipt["container"], "BEGIN READ ONLY; SELECT count(*) FROM drizzle.__drizzle_migrations; ROLLBACK;")
    r.require(count.strip() == b"63", "ISOLATED_LEDGER_NOT_63")
    return {"migrationRunner": "PASS", "ledgerEntries": 63,
            "riskPeopleApprovalsDataAcceptance": "REQUIRED_SEPARATELY",
            "liveDatabaseModified": False}

def main():
    os.umask(0o077)
    p=argparse.ArgumentParser()
    p.add_argument("command",choices=("verify58","correct-copy","rehearse"))
    p.add_argument("work");p.add_argument("manifest");p.add_argument("receipt")
    p.add_argument("extra",nargs="*")
    a=p.parse_args()
    work=r.private(a.work,True);receipt=controller.read(a.receipt)
    controller.client_setup(work)
    os.environ["UVANOO_PG_CONTAINER"]=receipt["container"]
    if a.command=="verify58": result=verify58(work,a.manifest,receipt)
    elif a.command=="correct-copy": result=correct_copy(work,a.manifest,receipt)
    else: result=rehearse(work,a.manifest,receipt,*a.extra)
    print(json.dumps(result))

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print(json.dumps({"error":str(exc) if isinstance(exc,r.Rejected) else "ISOLATED_REHEARSAL_REJECTED"}),
              file=sys.stderr)
        sys.exit(1)
