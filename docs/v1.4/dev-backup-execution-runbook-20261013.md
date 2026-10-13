# DEV backup SSH execution adapter

Product candidate: `563fb0e9b79a838a5f394abaffb2f7dc743fc571`.
Tool source: `d26399d028789240ade0ee30b3b64600e6188e9a`.
This is an owner-SSH procedure, not permission to merge, deploy, correct live SQL or change Traefik.
No live backup or fencing was performed while implementing it.

## Activation boundary

Run capture only after the administrator has established a DEV-exclusive recovery window:
no operator, Dokploy deployment, external database/queue/storage writer or scheduled DEV
job may start during it. Close/drain active Collabora editing sessions and confirm callbacks
cannot write. The controller fences DEV Collabora as well as Web and Worker. It never updates
Scheduler or Storage-init. Do not assert these conditions merely because the application
was previously restarting.

The window receipt is an operator attestation, not automatic discovery of every possible
privileged process. The controller independently checks Docker service versions, actual task
states, non-service container configuration, direct PostgreSQL/Redis clients and mounted
recovery-volume writers. An advisory lock only excludes another adapter using the same
directory; it does not lock out Dokploy or root.

If any condition remains uncertain, stop before the capture command. No additional blanket
authorisation, OVH account, new key or new backup platform is required.

## 1. Prepare the pinned tools in the owner's Ubuntu SSH session

Enter an authorised root shell using `sudo -i`. Keep this shell open so the variables below
remain available. Do not run these commands through a privileged Commander workaround.

```bash
set -euo pipefail
umask 077
test "$(id -u)" = 0
for tool in git python3 node age docker sha256sum; do
  command -v "$tool" >/dev/null
done
test "$(node -p 'process.versions.node.split(".")[0]')" = 24

TOOL_SHA=d26399d028789240ade0ee30b3b64600e6188e9a
RECOVERY_PARENT=/opt/uvanoo-dev/backups/recovery
test -d "$RECOVERY_PARENT"
TOOLSET="$(mktemp -d "$RECOVERY_PARENT/tools.XXXXXXXX")"
git -C "$TOOLSET" init --quiet
git -C "$TOOLSET" remote add origin https://github.com/Satho82/beaconhs.git
git -C "$TOOLSET" fetch --quiet --depth=1 origin "$TOOL_SHA"
git -C "$TOOLSET" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$TOOLSET" rev-parse HEAD)" = "$TOOL_SHA"
git -C "$TOOLSET" diff --exit-code

RECOVERY_WORK="$(mktemp -d "$RECOVERY_PARENT/capture.XXXXXXXX")"
chmod 700 "$RECOVERY_WORK"
install -m 600 -o root -g root   /home/ubuntu/uvanoo-preflight/backup-key-custody/uvanoo-dev-20261013.recipient   "$RECOVERY_WORK/recipient"
ADAPTER="$TOOLSET/scripts/cluster/dev-recovery"
printf 'TOOLSET=%s\nRECOVERY_WORK=%s\n' "$TOOLSET" "$RECOVERY_WORK"
```

Only the public recipient is copied. Existing verified independent private-key custody is
retained. Do not print the identity. The helper checks the previously approved recipient
fingerprint at capture time to prevent using a different destination key.

No host PostgreSQL installation is needed. Clients execute inside the verified PostgreSQL
16.15 container pinned to
`postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d`.
An image mismatch stops before fencing.

## 2. Activate the verified window and capture

Set the following confirmation only after satisfying the activation boundary above.
Restoration means the original replica specifications, including the originally restarting
Web/Worker state; it does not repair endpoints or claim application health.

```bash
export UVANOO_EXCLUSIVE_WINDOW_CONFIRMED=YES
test "$UVANOO_EXCLUSIVE_WINDOW_CONFIRMED" = YES
python3 - "$RECOVERY_WORK/window.private.json" <<'PY'
import datetime as dt, json, os, sys
value = {
    "operator": "owner-authorised Ubuntu SSH administrator",
    "expiresAt": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=60)).isoformat(),
    "noConcurrentDeployers": True,
    "externalWritersExcluded": True,
    "collaboraSessionsDrained": True,
    "restoreOriginalRestartingWriters": True,
}
with open(sys.argv[1], "x") as stream:
    json.dump(value, stream)
os.chmod(sys.argv[1], 0o600)
PY
python3 "$ADAPTER/backup_controller.py" capture   "$RECOVERY_WORK" "$RECOVERY_WORK/window.private.json"   > "$RECOVERY_WORK/capture-result.private.json"
cat "$RECOVERY_WORK/capture-result.private.json"
```

Success requires all five encrypted components: PostgreSQL dump, unchanged 21-document
metadata collector output, retained MinIO tree, CRC-checked Redis RDB/configuration provenance,
and Decision149/154/155 plus clean155 Redis and the stopped Decision155 inspection copy.
Redis jobs are not replayed or deleted. Original recovery volumes are read, never removed.
The read-only backup role must already have its required permissions; the adapter cannot
grant them.

The supervisor checks the fence throughout capture. Before/after database ledger, schema,
data and sequence fingerprints must match. Any mismatch prevents capture acceptance.
Raw PostgreSQL data, metadata, source service environments and temporary plaintext remain
private. Only ciphertext is exported.

The manifest binds the actual configured old application source
`6976a851c18e879df1813bb7c18729d6da5ab846`, tree
`3522b5c07b3f2b1b2a43383d8e3bc49c66cc4080`, and existing image digest
`sha256:a043f96d8c6b453d9df3e4b38b402963e6e3c0705c4ffb1aed19d6566cdfbec3`.
That is recovery provenance, not an assertion that the new product image is deployed or that
the old application currently connects to the permanent database.

The legacy manifest field `offHostReceiptSha256` hashes a receipt explicitly marked
`PLANNED_NOT_CAPTURED`. It is not independent archive custody. A separate post-transfer,
manifest-bound custody receipt is mandatory before restore.

## 3. Export ciphertext and transfer to the owner's Mac

Run only following successful capture and safe closure.

```bash
MANIFEST_SHA="$(python3 -c   'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])'   "$RECOVERY_WORK/capture-result.private.json")"
python3 "$ADAPTER/dev_recovery.py" verify "$RECOVERY_WORK" "$MANIFEST_SHA"
TRANSFER_PARENT=/home/ubuntu/uvanoo-backup-transfer
if test ! -e "$TRANSFER_PARENT"; then
  install -d -m 700 -o ubuntu -g ubuntu "$TRANSFER_PARENT"
fi
test -d "$TRANSFER_PARENT"
test ! -L "$TRANSFER_PARENT"
TRANSFER="$TRANSFER_PARENT/$MANIFEST_SHA"
python3 "$ADAPTER/backup_controller.py" transfer   "$RECOVERY_WORK" "$MANIFEST_SHA" "$TRANSFER"
(
  cd "$TRANSFER"
  sha256sum -c SHA256SUMS
)
chown -R ubuntu:ubuntu "$TRANSFER"
printf 'MANIFEST_SHA=%s\n' "$MANIFEST_SHA"
printf 'Remote ciphertext directory: %s\n' "$TRANSFER"
```

On the Mac, set `MANIFEST_SHA` to the exact printed value. No private key is transferred back.

```bash
umask 077
: "${MANIFEST_SHA:?Set the actual capture manifest SHA printed by SSH}"
test "${#MANIFEST_SHA}" = 64
mkdir -p "$HOME/Uvanoo-DEV-backups"
chmod 700 "$HOME/Uvanoo-DEV-backups"
test ! -e "$HOME/Uvanoo-DEV-backups/$MANIFEST_SHA"
scp -pr "ubuntu@57.129.152.57:/home/ubuntu/uvanoo-backup-transfer/$MANIFEST_SHA"   "$HOME/Uvanoo-DEV-backups/"
(
  cd "$HOME/Uvanoo-DEV-backups/$MANIFEST_SHA"
  shasum -a 256 -c SHA256SUMS
)
```

Stop here until the owner confirms the independent copy and all checksums passed.
Key custody alone does not establish backup custody. SHA256 and age headers do not prove
decryption; the following restore supplies that evidence.

## 4. Record actual custody and restore privately

Only after the Mac check passed, in the retained root SSH shell:

```bash
export UVANOO_MAC_COPY_CONFIRMED=YES
test "$UVANOO_MAC_COPY_CONFIRMED" = YES
python3 - "$RECOVERY_WORK/mac-custody-input.private.json" "$MANIFEST_SHA" <<'PY'
import datetime as dt, json, os, sys
value = {
    "manifestSha256": sys.argv[2],
    "location": "owner-independent-Mac",
    "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    "allChecksumsMatch": True,
    "independentHost": True,
    "attestedBy": "owner after independent Mac checksum verification",
}
with open(sys.argv[1], "x") as stream:
    json.dump(value, stream)
os.chmod(sys.argv[1], 0o600)
PY
python3 "$ADAPTER/backup_controller.py" custody "$RECOVERY_WORK"   "$MANIFEST_SHA" "$RECOVERY_WORK/mac-custody-input.private.json"

install -m 600 -o root -g root   /home/ubuntu/uvanoo-preflight/backup-key-custody/uvanoo-dev-20261013.agekey   "$RECOVERY_WORK/restore-identity.private"
install -m 600 "$ADAPTER/bootstrap-restore.sql" "$RECOVERY_WORK/roles.sql"
ROLES_SHA="$(sha256sum "$RECOVERY_WORK/roles.sql" | cut -d ' ' -f 1)"
RESTORE_PARENT=/opt/uvanoo-dev/backups/restore-isolated
test -d "$RESTORE_PARENT"
PRISTINE_PARENT="$(mktemp -d "$RESTORE_PARENT/pristine.XXXXXXXX")"
REHEARSAL_PARENT="$(mktemp -d "$RESTORE_PARENT/rehearsal.XXXXXXXX")"

python3 "$ADAPTER/backup_controller.py" restore "$RECOVERY_WORK"   "$MANIFEST_SHA" "$RECOVERY_WORK/restore-identity.private" "$PRISTINE_PARENT"   "$RECOVERY_WORK/roles.sql" "$ROLES_SHA"   > "$RECOVERY_WORK/pristine-restore.private.json"
python3 "$ADAPTER/isolated_rehearsal.py" verify58 "$RECOVERY_WORK"   "$MANIFEST_SHA" "$RECOVERY_WORK/pristine-restore.private.json"

python3 "$ADAPTER/backup_controller.py" restore "$RECOVERY_WORK"   "$MANIFEST_SHA" "$RECOVERY_WORK/restore-identity.private" "$REHEARSAL_PARENT"   "$RECOVERY_WORK/roles.sql" "$ROLES_SHA"   > "$RECOVERY_WORK/rehearsal-restore.private.json"
python3 "$ADAPTER/isolated_rehearsal.py" verify58 "$RECOVERY_WORK"   "$MANIFEST_SHA" "$RECOVERY_WORK/rehearsal-restore.private.json"
python3 "$ADAPTER/isolated_rehearsal.py" correct-copy "$RECOVERY_WORK"   "$MANIFEST_SHA" "$RECOVERY_WORK/rehearsal-restore.private.json"
```

The pristine restore is retained. Only the second isolated copy can receive the exact
hash-pinned two-statement default-ACL correction. Its original fingerprint must equal
`0529262d8f4b1a323994e1dbeae85e70b3506cd0746c2faf3d0b4e014ccb0074`; after correction it
must equal independently established canonical58
`730d95c22ad6914d68bcdbea46283741f24ebd21a5f609c7951a4e5f72392a7c`, with unchanged
ledger and data hashes. No broad provisioning is run after restoration.

Every restore gets a new private data directory, a unique labelled PG16.15 container,
network none, no published ports and resource limits. Neither a persistent container name
nor an existing production data directory is an accepted destination.

## 5. Gate-preserving migration rehearsal boundary

The launcher is implemented, but an accepted real-data 58-to-63 run has not occurred.
Before invoking it, obtain an immutable migration-tooling image containing the exact clean
product checkout, Git, Node24, frozen dependencies and tsx. The application runtime image
does not contain that toolchain. Verify image revision/source labels and registry digest.

Supply actual existing-gate evidence for the corrected isolated database: current database
OID, canonical58 and canonical63 schema contracts, exact migrations, fresh encrypted
corrected-state backup with successful independent restore, matching data/ledger hashes,
rollback identity and a genuine GitHub Actions restore run. Do not use the synthetic
adapter runs as real-data restore evidence. Do not relabel the original uncorrected backup
as a corrected-state backup. The unchanged one-hour freshness gate still applies.

Once those prerequisites genuinely exist:

```bash
: "${REHEARSAL_IMAGE:?Verified immutable migration-tooling image required}"
: "${RELEASE_EVIDENCE_PATH:?Real corrected-state gate evidence required}"
python3 "$ADAPTER/isolated_rehearsal.py" rehearse "$RECOVERY_WORK"   "$MANIFEST_SHA" "$RECOVERY_WORK/rehearsal-restore.private.json"   "$REHEARSAL_IMAGE" "$RELEASE_EVIDENCE_PATH"
```

The launcher creates only an isolated runner sharing the restored container's network-none
namespace. It supplies the exact gate variables, mounts evidence/ciphertext read-only, and
keeps migration output private. It never sets the candidate gate false. The historical
runner retains advisory locking, atomic migration execution and existing security installers.
A runner success and 63 entries do not alone certify Risk/People/Approvals acceptance:
compare the expected backfills, constraints, permissions, tenant/property isolation,
operational history and attachment/object references, and reuse unchanged successful
contract tests where applicable.

Missing image/evidence is a genuine stop boundary, not a reason to bypass the gate.

## Failure, rollback and stop conditions

- Any preflight error: no service mutation is allowed to follow it.
- Interrupted or failed capture: keep the private directory, journals, ciphertext and all
  original volumes. Do not rerun capture into the same directory.
- Failed restoration: re-fence only versions still owned by this adapter. Unknown/concurrently
  changed versions are never overwritten. One-shot jobs remain untouched.
- The process checks every two seconds; it is not a global root/deployment admission controller.
  A lost exclusive window invalidates acceptance.
- No automatic restoration follows an uncertain capture. Do not blindly scale everything to
  one, invoke compose.deploy, remove locks, restart completed jobs or edit a journal.

After reviewing the private journals, confirming no capture process remains and establishing
a fresh verified window, the explicit recovery command is:

```bash
python3 "$ADAPTER/backup_controller.py" recover   "$RECOVERY_WORK" "$RECOVERY_WORK/recovery-window.private.json"
```

Create `recovery-window.private.json` using the same reviewed window schema with a fresh
expiry. Recovery compares exact service versions, rejects incomplete mutation receipts and
active DB/Redis captures, requires the live ledger still to have 58 entries, and restores
only recorded original replicas. If it rejects, leave affected writers fenced and review
the reported condition; there is no privileged workaround. A manually recovered failed
attempt is not promoted as an accepted backup.

For isolated restore/rehearsal failure, retain both copies and private logs. Never execute
SQL downgrade, delete ledger rows or overwrite the live database. No live rollback is
part of this rehearsal.

## Validation and remaining operational evidence

The adapter validation uses a GitHub-hosted disposable daemon, synthetic records and
synthetic receipt inputs, never actual DEV data or keys. It exercises encrypted five-component
capture, real Swarm compare-and-swap fencing/restoration, continuous checks, Redis CRC,
private transfer packaging and restore fingerprint equality. Synthetic ledger entries use
the 58 source identities, but the fixture is explicitly not the canonical227-table reference.

All Risk, People, Approvals, migration SQL and deployment workflow files are unchanged.
No live capture checksum, Mac backup receipt, actual-data restore or real-data migration
result exists from this implementation task. Publish only the resulting non-sensitive
manifest hashes, validation outcomes and source/image identities after later authorised
execution; never raw metadata, backups, service environments or private identities.

## Recovery checkpoint — 13 October 2026

Verified adapter branch HEAD: `d26399d028789240ade0ee30b3b64600e6188e9a`.
Verified Git tree: `b4ccfe56757f8b3afd0d62980de9e51432c421a0`.
Latest targeted validation: [38393904205](https://github.com/Satho82/beaconhs/actions/runs/38393904205), completed successfully at this exact source.
Previous disposable evidence: [38392830607](https://github.com/Satho82/beaconhs/actions/runs/38392830607) and [38391683329](https://github.com/Satho82/beaconhs/actions/runs/38391683329).

At this checkpoint no GitHub Actions run was in progress. Commander reported the VPS online; its execution identity was UID 1000. A limited readable `/proc` inspection found no backup-controller, isolated-rehearsal, pg_dump or pg_restore process. This does not establish absence of another operator or privileged writer. The prior Commander privileged-command restriction is not bypassed. The administrator SSH route remains the execution path.

Live fencing, capture, archive custody, restore and real-data rehearsal remain NOT EXECUTED by this controller. Exclusive operator window, external-writer exclusion and Collabora drainage must be established before section 2; no truthy attestation may substitute for that verification. No key re-verification or unchanged full CI was repeated.
