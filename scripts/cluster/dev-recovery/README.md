# Uvanoo DEV encrypted recovery system

Status: implementation proposal; first live capture is blocked pending independent
key custody, off-host destination and a reviewed unchanged-state fencing supervisor.
Product, historical migrations, existing generic backup/restore helpers, DEV
migration gate and staging/production workflows are unchanged.

## Prepared identity and custody

A dedicated native age identity was prepared on the VPS with file mode 0600,
inside a 0700 directory. No private key was printed or published.

- Private identity: /home/ubuntu/uvanoo-preflight/backup-key-custody/uvanoo-dev-20261013.agekey
- Recipient file: /home/ubuntu/uvanoo-preflight/backup-key-custody/uvanoo-dev-20261013.recipient
- SHA256 of the public recipient without trailing newline:
  138aa3b6a8f40c219b5d69a30357cf5ac9971c9523c87c04e42fc43c5434727f

This is a PREPARED recipient, not a declaration of independent recoverability.
The only known identity copy is on the VPS. First live backup must wait for an
owner-controlled independent secret vault or encrypted recovery escrow, with
tested retrieval and decrypt on a separate trusted cloud runner. Do not put the
identity in GitHub, a public Actions artifact, a chat message or beside the only
backup. Do not use the owner's Mac.

Custody verification: upload the identity through the chosen vault's secure
channel; record its object/version identifier and access policy privately; retrieve
it on a separate private cloud runner; derive the public recipient and compare its
SHA256; encrypt/decrypt a random non-sensitive challenge; destroy only the test
runner's temporary key/plaintext after verification. Record timestamps, public
fingerprint and result only. A successful local decrypt or copied file is not
off-host custody proof.

Rotation: generate a new identity in a new protected path; complete independent
custody verification; approve the new public fingerprint; switch only subsequent
captures. Retain old decryption identities for every retained archive. Do not
overwrite keys or re-encrypt/delete originals in place. If compromise is suspected,
stop capture/release and review vault access and archive exposure before rotation.

## Architecture and destinations

The recovery set has five encrypted components:

1. PostgreSQL custom-format dump with ownership and ACL entries retained.
2. The unchanged approved 21-document collector: identity, ledger and 19
   schema/security sections, including roles, memberships, role tuning, default
   ACLs, functions, triggers, extensions and database/schema ownership.
3. MinIO object data, metadata, configuration and an attachment/object checksum
   mapping, all encrypted. Preserve the retained volume even if the service is absent.
4. Redis persistence and queue provenance: source endpoint, Redis configuration
   fingerprints, RDB/AOF identities, persistence status and queue counts. Never
   automatically replay, flush, delete or copy a queue into another Redis.
5. A separately labelled clean155/Decision149/154/155 recovery inventory and
   recovery data archive. Preserve originals; do not start containers to inspect them.

A component can contain an explicitly approved absence/inventory record only
when no data exists and the owner has accepted that disposition. A missing
container or currently empty Redis keyspace is not evidence that its retained
volume is empty. The tooling requires all five encrypted components and does not
invent empty replacements.

Proposed protected local staging root: /opt/uvanoo-dev/backups/recovery, mode0700.
Use a new unique 0700 capture directory each time; archive and receipt files0600.
This root is not created or installed by this implementation. Previous bounded
preflight measured about29.1GB free; recheck before capture. Plaintext dump staging
exists briefly inside a private temporary directory. Use a dedicated encrypted
filesystem or a bounded tmpfs after capacity assessment if plaintext-at-rest
protection is required. File unlink is not secure erasure of disk blocks.

Off-host destination remains an OWNER DECISION. Use an independent private backup
account/bucket with versioning, immutable retention and separate delete authority.
The VPS upload principal should not be able to delete retained backups or retrieve
private decryption keys. The uploader, provider and account cannot be configured
until that destination is selected. No public GitHub artifact is a backup backend.
Download the complete encrypted recovery set on an independent private runner and
run compare-copies using the separately recorded immutable manifest digest.
Checksums establish integrity; the independent host/account identity establishes
off-host separation.

A second copy on the same VPS, or only a hash beside its data, is insufficient.
The manifest is content-addressed and creation is exclusive/no-overwrite. Pin its
SHA256 in the independent vault/retention system. These file-level protections do
not make the local filesystem WORM or provide digital signing.

Proposed policy requiring owner ratification: nightly recovery set at02:00 UTC,
before each migration/release, daily retention14days, weekly8weeks, monthly12months.
Keep pre-release and failed-recovery sets under legal/operational hold until
explicitly released. Never prune original clean155/recovery volumes. No automatic
deletion is implemented or authorised by this proposal.

Capacity: require free staging capacity greater than twice measured capture
size plus expected restore working space and a20% reserve; alert on insufficient
space, failed capture/upload/decrypt, last-success age over26hours and failed
monthly restore rehearsal. Alert destination and quiet/maintenance-window policy
remain owner decisions. No timer or notification was enabled.

## Implementation

- dev_recovery.py: guarded PostgreSQL capture, per-component age encryption,
  exclusive content-addressed manifests, checksum verification, private component
  decryption, independent-copy checksum comparison and strict backup gate fragment.
- restore_disposable.py: creates a unique fresh PostgreSQL16.15 container using
  postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d,
  network none, no published ports, resource limits and a new private data directory.
  No existing target database/container/volume can be passed to this helper.
- test_dev_recovery.py: focused encryption and failure contracts.
- disposable_validation.py: isolated synthetic database/security round-trip.
- .github/workflows/dev-recovery-validation.yml: ephemeral cloud validation with
  no live credentials, no raw artifact upload, no schedule and no deployment.

Run help with python3 scripts/cluster/dev-recovery/dev_recovery.py --help.

capture-pg requires explicit PGHOST/PGPORT, PGDATABASE=beaconhs and PGUSER=beaconhs_backup.
Use a private pgpass/service file; never place connection passwords in CLI arguments.
It checks the connected role, read-only default, BYPASSRLS, NOSUPERUSER, exact
database OID and PostgreSQL16.15, plus exact pg_dump16.15. It refuses plaintext-only
capture. Unlike the existing generic backup helper, this DEV-specific capture
preserves archive owner/ACL entries. The collector is forced read-only and
verified against its approved SHA256. Child-process errors are redacted.

The private context binds source SHA/tree, intended image digest, original database
OID/name/version, the existing gate's ledger/schema/data fingerprints, public
recipient fingerprint and custody/off-host/guard/collector receipt hashes.
Do not fabricate these hashes. Receipt existence or a boolean is not proof of
custody, storage independence or fencing; the approved operational supervisor and
independent observations must establish those facts.

The capture guard is an executable whose approved SHA256 is bound in the context.
It must be independently reviewed and continuously supervised. This kit validates
the guard before capture, after the plaintext capture and after encryption.
Those checks alone are not a continuous fence. The live adapter is deliberately
NOT supplied as an always-successful default; first live capture remains blocked
until the complete DEV/control-plane/external-writer supervisor is verified.

capture-start.json records actual start time before pg_dump.
capture-complete.json binds the database and metadata ciphertexts after the final
guard. Finalisation preserves that start time; restore or upload cannot reset
backup freshness. Only complete five-component manifests are promoted.

The key file must be private and symlinks/overwrites are rejected. Failed decrypts
may leave private partial plaintext that must not be mistaken for verified output.
Temporary data cleanup is confined to paths this operation created. No existing
backup, recovery volume or live database is deleted.

## Fencing and restoration contract

Current evidence: DEV desired replicas1 for web, worker, scheduler and storage-init;
web/worker unhealthy, scheduler/storage-init observed0/1; Collabora1/1.
A zero current connection count or empty queue is not a fence.
The previous candidate fence helper expects a candidate deployment and health
convergence; it is not a verified unchanged-state backup suspend/resume mechanism.

Before any live change, implement/review the exact target-specific supervisor:

1. Acquire an exclusive recovery operation lock and prevent concurrent Dokploy,
   Actions, external operator and integration changes for the DEV target only.
2. Privately record exact saved Compose/env and live service specs, image identities,
   desired replicas, active tasks, scheduler/repeat jobs, network/mount identities.
   Hash specs publicly; never expose environment values or secrets.
3. Inventory and stop admission for every DEV database, queue and storage writer:
   web, worker, scheduler, storage-init, callbacks, Collabora-related edits, direct
   clients, integrations and host jobs. Confirm other stacks' specs are unchanged.
4. Persist the approved DEV fence in its control plane; use reviewed service-only
   controls that cannot rerun storage-init or shared Collabora changes.
5. Require two complete observations of zero active writer tasks and connections,
   unchanged fence/configuration, and no new jobs. Monitor for the whole capture.
6. On drift or timeout, abort capture and preserve the fence. Independent watchdog
   must re-fence on controller/runner loss; an Actions finally step is insufficient.
7. Restore only the recorded, approved state when safe. Check external readiness
   before releasing queue/scheduler writers. Today's unhealthy old state cannot
   satisfy this automatically: retain affected writers fenced and escalate if
   restoration is unsafe. Never silently deploy another image to recover.

No writer mutation, watchdog, control-plane update or service deployment was
performed by this implementation. Verifying this supervisor remains required.

## Independent restore and gate integration

The restore helper restores only into its newly created isolated container.
A reviewed, hash-bound bootstrap SQL file must create the approved uvanoo_dev
profile and canonical roles with fresh disposable credentials, database owner/ACLs
and role settings. Do not restore live password hashes. Extension owners must
match the independently approved bootstrap profile. Do not run broad provisioning
grants after restoration. The archive preserves per-object owners/ACLs.

pg_restore success is only archive restoration, not full acceptance. Compare all
58 ledger entries and all19 metadata sections against the captured original;
compare full table data hashes, counts, sequence state, attachment mappings and
tenant/property/Risk security before accepting the restore. Compare the corrected
isolated copy against the independent canonical58 reference, never itself.

Apply the two approved ACL corrections only to that isolated copy, then rehearse
0059–0063 with the exact candidate runner and locking. Preserve the uncorrected
restore as recovery evidence. The new helper never applies migrations or starts
application/queue services.

The gate-fragment command consumes a separately verified restore receipt and emits
only the existing ReleaseEvidence.backup shape. It rejects source/tree/image,
ledger/schema/data differences, invalid rollback digest, non-repository restore
run, future timestamps or backup age beyond one hour. It does not create a full
release manifest or relax the existing DEV Migration Gate. Original database OID
is retained as source identity; restored database OID may differ.

A GitHub restoreRun must identify an actual private restore executor result.
A fabricated URL or the synthetic unit-test run is unacceptable. Since this repo
is public, actual data/key custody must never be uploaded to its hosted workflow.
Selecting a private isolated runner/control repository and secure receipt bridge
is a remaining deployment decision. The included workflow is synthetic only.

A live ACL correction would change schemaHash: retain its pre-correction recovery
set, then obtain a fresh post-correction backup and independently verified restore
for the release gate's one-hour window. Do not rewrite the earlier receipt.

## Decisions before activation

Owner input required: independent secret-vault/escrow destination and custodian;
off-host private backup account/bucket with retention/delete authority; approved
private restore host/runner and credentials channel; retention/RPO/RTO and failure
alert recipient. Never provide a private identity or password in chat.

Engineering gates still required: actual off-host key recovery/decrypt proof,
selected storage upload/download adapter and retention enforcement, fully verified
unchanged-state writer supervisor/watchdog, actual attachment and clean155 data
disposition, real-data restore/rehearsal, final release/security validation on the
eventual integrated source. No first live backup is ready yet.

The existing owner authorisation for DEV backup/rehearsal remains recorded.
Do not ask for that same blanket permission again. Live ACL correction, migrations,
governed merge, DEV deployment and DEV-only Traefik Basic Auth removal remain
separate approvals. Native login, RBAC/RLS and tenant/property security stay intact.
