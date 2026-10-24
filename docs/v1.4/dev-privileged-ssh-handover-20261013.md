# DEV privileged SSH handover — not capture-ready

Owner execution through the existing sudo SSH session is authorised. No Commander security change is requested. No privileged command was executed by this handover.

## Corrected readiness statement

The remaining work is not solely sudo access. Reviewed source at e1c6a7e87e115bad10276b93b2eec6304a7d8506 provides validated capture/encryption/restore primitives, but not a live backup-only fencing supervisor or a complete five-component capture adapter. Prior reports overstated access as the only remaining blocker.

Existing passing disposable evidence is retained: https://github.com/Satho82/beaconhs/actions/runs/38380746756. It does not prove actual DEV suspension/restoration, storage capture or real-data migration.

## A. Exact SSH commands ready now: stage pinned tools only

Run this block in the owner's Ubuntu SSH session. It creates a fresh private directory and downloads three public source files. It does not read private keys, pause services, capture data or run a restore.

```bash
bash <<'UVANOO_PREPARE'
set -euo pipefail
umask 077
for tool in curl git python3 sha256sum; do
  command -v "$tool" >/dev/null
done
test "$(id -un)" = ubuntu
test -d /home/ubuntu/uvanoo-preflight
HANDOVER_DIR="$(mktemp -d /home/ubuntu/uvanoo-preflight/ssh-handover.XXXXXXXX)"
chmod 700 "$HANDOVER_DIR"
SOURCE_SHA=e1c6a7e87e115bad10276b93b2eec6304a7d8506
while read -r NAME EXPECTED_BLOB; do
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    "https://raw.githubusercontent.com/Satho82/beaconhs/$SOURCE_SHA/scripts/cluster/dev-recovery/$NAME" \
    --output "$HANDOVER_DIR/$NAME"
  chmod 600 "$HANDOVER_DIR/$NAME"
  test "$(git hash-object --no-filters "$HANDOVER_DIR/$NAME")" = "$EXPECTED_BLOB"
done <<'FILES'
dev_recovery.py b850f2336c87c00033c969b43581216e933c3146
restore_disposable.py b433623c28aaac92d1503fa89dc9323f63fb7c34
bootstrap-restore.sql 3109a34ad2fca90a403c056e942b4a03d668d983
FILES
(
  cd "$HANDOVER_DIR"
  sha256sum dev_recovery.py restore_disposable.py bootstrap-restore.sql > TOOLING.SHA256
  sha256sum -c TOOLING.SHA256
)
printf 'Pinned tooling prepared: %s\n' "$HANDOVER_DIR"
UVANOO_PREPARE
```

These commands are source-reviewed preparation, not an executed live validation result. Retain the printed directory; no further key or inventory check is requested.

## B. Required backup-only fence contract

- Privately save all DEV service specifications and original replica counts. Record hashes, never environment values, in public evidence.
- Do not invoke compose.deploy.
- Completed scheduler and storage-init must remain untouched: do not scale them down/up, force-update or recreate them.
- Pause only identified repeating DEV writers via reviewed direct service controls. Determine whether Collabora can still issue write callbacks.
- Establish an exclusive DEV recovery window against concurrent operator/deployer changes. An advisory file lock by itself does not stop Dokploy or another operator.
- Independently check actual task states, direct DB/Redis clients and stable original-spec hashes throughout capture; abort rather than promote a capture if the fence changes.
- Restore only the original safe service state; never restart one-shot jobs as a restoration shortcut. Current broken endpoints must not silently be corrected. If safe restoration cannot be established, define the fenced end-state before pausing services.

The existing scripts/cluster/dev-writer-fence.mjs invokes compose.deploy and is therefore ineligible for this task. No replacement live supervisor is included or certified by this handover.

## C. Actual capture inputs still required

The reviewed capture-pg CLI requires, in order:
directory, recipient file, context JSON, guard executable, metadata SQL.

Its context() rejects anything other than sourceSha, sourceTree, imageDigest, database, databaseOid, postgresVersion, ledgerHash, schemaHash, dataHash, recipientSha256, custodyReceiptSha256, offHostReceiptSha256, fenceGuardSha256 and metadataSqlSha256. These must be real evidence, not zeros or arbitrary hashes.

The source/image pair must be coherent. Do not pair product SHA563fb0e9b79a838a5f394abaffb2f7dc743fc571 with the old configured image and claim it is the candidate image. A pre-release recovery capture may record the actual current source/image separately from the intended rehearsal source, but that mapping must be reviewed.

The helper calls host psql/pg_dump/pg_restore; the host clients were absent at last inspection. The cached PostgreSQL16.15 image does not automatically satisfy those executable requirements. A reviewed pinned client adapter remains necessary.

The public recipient is owned by ubuntu. private() requires input ownership to equal the executing UID. Blindly running the existing helper with sudo against ubuntu-owned private paths will fail. The wrapper must deliberately preserve one execution identity and private ownership; do not relax permission validation.

The offHostReceiptSha256 must have an explicit truthful meaning under the owner-selected post-capture Mac transfer plan. It cannot attest that the not-yet-created archive is already independently held. Independent archive custody must be recorded only after transfer and checksum verification.

finalize() requires five encrypted components: database, metadata, storage, redis and clean155. It will not accept database-only capture. Required adapters must:
- retain PostgreSQL owners/ACLs and collect all21 approved metadata documents;
- archive retained MinIO data/configuration and privately map the2 attachment references;
- inspect/capture real Redis persistence and provenance; permanent Redis was observed without a mounted volume, so do not substitute the clean155 Redis volume;
- consistently preserve stopped Decision149/154/155 and clean155 recovery contents without restarting or deleting them;
- keep temporary plaintext private and never publish it.

No exact capture invocation is declared ready while these inputs/adapters and supervisor remain unvalidated. No placeholder successful guard, fabricated manifest or partial archive promotion is permitted.

## D. Checksums and Mac transfer boundary

The existing verify(directory, manifest_sha256) validates the content-addressed manifest and all five ciphertext hashes, sizes and age headers. An age header plus SHA256 proves format/checksum, not successful decryption or semantic restore.

After a real recovery set exists, prepare a separate transfer directory containing only its five .age files, content-addressed manifest and relative-name SHA256SUMS. Do not transfer arbitrary staging-directory contents: temporary plaintext and private diagnostics must be excluded.

SCP must use the actual verified transfer path, then the owner checks all ciphertext hashes on the Mac and confirms independent custody before risky operations. There is no archive/path/checksum yet, so an exact runnable SCP command cannot truthfully be supplied now. Do not invent a timestamp, filename or digest. The user's key fingerprint and custody remain PASS; no repeat key verification is needed.

## E. Isolated restore and rehearsal boundary

After actual off-VPS archive custody confirmation, use the existing restore_disposable.py interface:
directory, manifest_sha256, identity, private_parent, roles_sql, roles_sha256.

The helper creates only a fresh uniquely named PostgreSQL16.15 container pinned to:
postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d

It uses network none, no published ports, fresh private data,2GiB memory/1CPU, and preserves owner/ACL entries. It requires the verified manifest, private ownership and pg_restore client; do not substitute a persistent container name.

Archive restore success is not acceptance. Compare all58 ledger identities,19 schema/security sections, data/sequence hashes, five properties,968 lifecycle events, Risk data and attachment references before correcting the isolated copy.

Then execute only the previously validated two-statement default-ACL correction on that isolated copy, confirm canonical58 fingerprint730d95c22ad6914d68bcdbea46283741f24ebd21a5f609c7951a4e5f72392a7c, and run the exact candidate's migration runner through0063 with its security installers and locking. Preserve a pristine uncorrected restore for recovery evidence. Do not rerun broad provisioning or change historical SQL.

The exact rehearsal launcher/connection binding must be reviewed for network-none/socket execution before commands are issued; no generic DATABASE_URL may point to live DEV. Verify final63 identities, Risk/People/Approvals/RLS/ACL/data, rollback/retry and tenant/property isolation.

## F. Remaining blockers and owner action

No further blanket owner approval, OVH account, key validation or inventory confirmation is required. The owner's SSH route resolves who may execute privileged work.

Engineering must supply and validate the minimal live fencing/client/component adapters and truthful context/receipt binding before this becomes an executable capture runbook. This document does not claim those are implemented. No live operations were performed.

Existing source, product, migration SQL, runtime security and deployment gates remain unchanged. Governed merge, live ACL correction/migration, deployment and Traefik changes remain excluded.
