# Governed integration and DEV release procedure

**Prepared only. No merge, image publication, persistent write or deployment was executed. Do not dispatch deployment from this report.**

## 1. Source and merge gate

PR [#9](https://github.com/Satho82/beaconhs/pull/9) was re-read on 13 October: open, draft, mergeable, clean; head `563fb0e9b79a838a5f394abaffb2f7dc743fc571`, base `d18f635a41f092e9e86aa6f53518f9c28992b0d2`.
GitHub preview `b9ed505a4150b4dc8929edcf52f8574f43a154b0` has those two parents and tree `324c50a60e2cb0639ba920488a150c6531968374`. It is a temporary merge preview, not a merged release.

After visual closure and explicit owner merge approval:

1. Reserve a governed-branch write window. Re-read exact PR head/base, mergeability, reviews, branch protection and active workflows. If either SHA changes, stop and review the new diff.
2. Confirm product diff remains the reviewed 96 files, and all canonical migrations plus People/Risk protection match the manifests. Keep overnight/review documentation and harnesses outside the product PR.
3. Mark ready and use an ordinary history-preserving merge into **feature/uvanoo-v1.4**, with expected PR head equal to the SHA above. No squash, rebase, main retarget, force push or protection bypass.
4. Immediately record the actual new merge SHA, parents and tree. If base/head are unchanged, tree must be `324c50a60e2cb0639ba920488a150c6531968374`. Do not assume GitHub's preview SHA will be the final SHA.

The current source is structurally mergeable but **not approved for merge** by this task. Branch-protection/reviewer satisfaction must be checked at execution; GitHub mergeable=true does not replace it.

## 2. Image publication and immutable binding

Feature push triggers `.github/workflows/uvanoo-v1.4-fast-dev.yml` and the path-filtered `uvanoo-v1.4-cloud-build.yml`. The reviewed product diff includes triggering paths. Neither deploys DEV. Main CI has different deployment behaviour and must not be dispatched or retargeted.

The authoritative feature workflow checks out its immutable RELEASE_SHA, validates, then builds/publishes linux/amd64 to `ghcr.io/satho82/uvanoo-staging-private:v1.4-dev-<actual-merge-sha>` and the full-SHA tag. The package name does not authorize a staging deployment.

Require successful **Validate frozen V1.4 source** and **Publish immutable V1.4 DEV candidate** jobs on the exact current governed head. If a run did not trigger, review the reason before an explicitly controlled manual feature workflow run. Reuse isolated tests as supporting evidence; they cannot satisfy the dispatcher's exact governed-head authority.

Record source SHA, Git tree, workflow/run/job identities, image digest, platform, OCI source/revision/version labels and package access. Pull/inspect by digest in the approved execution environment. Tag alone is insufficient. The disposable standalone browser artifact is not an OCI release image. **No verified candidate or post-merge OCI digest is available in this review.**

## 3. Read-only DEV preflight — all live items blocked

Target VPS connector `vps-c54e0b88` reports offline, last seen 86h ago. An explicit device ping failed. No local/Mac workaround was used.

Supplied facts remain historical: PostgreSQL 16.15, database beaconhs, 58 ledger entries, 227 tables/34 MB, user uvanoo_dev; permanent dependencies previously healthy; Web/Worker 0/1 using missing/stopped clean155 endpoints. Basic Auth 401 is expected at the proxy and proves neither application readiness nor database compatibility.

Before any persistent change:

- Obtain a read-only repeatable-read snapshot and full `drizzle.__drizzle_migrations` ordered by id. Compare hashes, timestamps and order to [all 63 identities](../overnight/migration-identity-manifest.json); require a strict prefix, never a count-only match. Reject duplicate, unknown, altered, missing, ahead or out-of-order history.
- Inspect complete schema, ownership, database/schema/table/column/function ACLs, default ACLs, constraints, extensions, functions, RLS/FORCE RLS, policies and Risk/People provenance triggers. Verify actual role memberships and login identities.
- Supplement the gate's catalogue fingerprint: its role and default-ACL queries filter `beaconhs_%`; separately review **all relevant legacy roles including uvanoo_dev and their transitive memberships**, nonstandard owners, role/database settings and grants. A passing fingerprint alone is not an audit of every legacy principal.
- Use the [read-only query inventory](../overnight/READ-ONLY-PREFLIGHT.sql) as a starting point, not a complete verifier. Review full memberships including PostgreSQL 16 inherit/set options. Do not invoke migrate.ts or migrate-dev.ts diagnostically; their convergence code writes.
- Verify tenant/property/person/assignment/Approvals/Risk counts, referential integrity, provenance, sequence state and storage object references. Keep row-level information and credentials private; publish only sanitized counts/digests.
- Inventory stopped clean155 containers, volume identities, mounts and retained backup metadata without starting them. Determine authoritative dataset and divergent attachment data. Preserve both before any reconciliation; never assume the empty uvanoo_dev database is a target.
- Inspect permanent Redis and surviving clean155 persistence offline/through read-only access: namespace, queue names, state counts, task IDs, delayed/repeat schedules, locks and scheduler ownership. Use bounded SCAN/TYPE and state-appropriate reads, not KEYS over the whole instance, consuming reads, BullMQ workers, flush, purge or replay. Do not print job payloads or credentials.
- Verify private object store endpoint/bucket, keys/versions/checksums, encryption/sealed-provider key continuity, attachment capability secret continuity and storage policy/lifecycle state.
- Verify backup role is LOGIN, NOSUPERUSER, BYPASSRLS, default read-only, cross-tenant SELECT only; no DML, DDL, ownership, escalation or dangerous membership. Read-only settings alone are not a privilege boundary. Prove write denial with that setting disabled only on the disposable restore fixture.

Intended DEV-only endpoints, subject to live DNS/overlay identity:
`uvanoo-dev-postgres:5432/beaconhs` and authenticated `uvanoo-dev-redis:6379` on existing `uvanoo-dev-private`.
Candidate URL checks require beaconhs_migrator, beaconhs_app, beaconhs_super and beaconhs_backup separation. The recorded uvanoo_dev login does not establish those roles exist. Missing roles/grants/network access are blockers requiring a separately reviewed change; never weaken the checks.

If the live ledger is exactly the canonical 58-entry prefix, the pending suffix is:
0059_risk_template_draft_state → 0060_risk_template_families_manual_assessments → 0061_risk_assessment_revisions_archive_signoffs → 0062_approvals_batch01 → 0063_approvals_production.
A canonical 61-entry prefix needs 0062/0063; 62 needs 0063. Canonical history includes 0000 and omits historical 0033; do not renumber.

Existing CI proved disposable 58/61/62→63 paths on PostgreSQL **16.14**, not actual DEV 16.15 data. Require an exact 16.15 restored-data rehearsal and independently reviewed prefix/target catalogue fingerprints. Never bless the live fingerprint by copying it into an expected manifest without review.

## 4. Backup, restore and rollback gate

No current backup, restore or rollback evidence is verified.

1. Approve authoritative dataset/queue/storage disposition, window, RPO/RTO and destination/key custodians. Fence every writer: stack web/worker/scheduler plus external jobs, integrations, cron and direct clients. Confirm no surviving write sessions; document how ingress and external clients remain fenced.
2. Preserve old deployed source/tree/image digest, service configuration, role/security contract, object-store policy/lifecycle and object versions, Redis persistence and queue inventory. The current deployed image remains unknown; it cannot be declared compatible with beaconhs.
3. Use the restricted backup identity and `scripts/cluster/backup.sh` with an approved age recipient; never enable plaintext override. **The script first creates a mode-restricted plaintext temporary archive**, then encrypts it. Require an encrypted ephemeral filesystem or appropriately sized tmpfs and verified cleanup. Do not claim it streams directly to encryption.
4. Require and independently verify encrypted archive SHA256. `restore-verify.sh` allows absent checksum/summary sidecars, so the release procedure must require them. Decrypt only within an isolated private restore environment with protected temporary storage and no persistent DEV connection.
5. Restore the exact archive to disposable PostgreSQL 16.15. Both repository scripts omit ownership/ACLs in the dump/restore; restore the independently reviewed roles/ownership/grants/default-ACL contract. Count checks alone do not prove security or data equality.
6. Compare full ordered ledger and catalogue/data/sequence fingerprints before migration; rehearse the canonical suffix and RLS/RBAC convergence against restored real data; inspect 0063 constraints/statuses/triggers. Prove isolation, backup role denial and attachment restoration privately.
7. Prepare a schema-compatible rollback image or **restore-and-switch** recovery to a separate database. Retain original and failed state. Never delete ledger rows, run down SQL or overwrite the original database. An image downgrade after forward migrations is unsafe without proof.
8. Bind the actual post-merge SHA/tree/OCI digest, live database name/OID and server_version_num, ordered identities, trusted schema fingerprints, exact archive hash, original/restored ledger/data/schema hashes, restore run URL and rollback digest using `ReleaseEvidence` in `packages/db/src/dev-migration-gate.ts`. Owner approves the final manifest SHA256.
9. The backup evidence has a **one-hour freshness limit**. Produce fresh fenced evidence within that window; if it expires, regenerate/reverify rather than edit timestamps. Encrypted archive and manifest must be at `/opt/uvanoo-dev/release-evidence/<actual-source-sha>/` before dispatch, with restricted ownership, no symlink ambiguity and private archive storage.

## 5. Deployment sequencing and side effects requiring approval

This section corrects overly generic “restart in controlled order” language in the overnight proposal. The current workflow actually:

1. Verifies current governed SHA, authoritative run and image labels/digest in `deploy-v1.4-dev-candidate.yml`.
2. Invokes reusable `deploy-dev.yml`; validates DEV target/URLs/storage, persists WRITER_REPLICAS=0 and deploys the saved compose to stop the three stack writers.
3. Verifies roles/topology/evidence, verifies actual writer tasks are zero, then runs `src/migrate-dev.ts` under the canonical migration lock. SQL plus ledger atomicity is per migration; a later failure may leave an earlier suffix applied. Keep failed state fenced and inspect before recovery.
4. Installs Collabora branding, updates the DEV compose/environment, installs immutable candidate specs with WRITER_REPLICAS=0, then calls writer-fence restore.
5. **Restore sets all three writer replicas to 1 together**, checks exact image/source and runtime health (including successful one-shot scheduler completion), then runs external readiness. It does not hold Worker/Scheduler until browser smoke completion.

Critical preconditions:

- Before checkout/fencing, the reusable workflow prunes builder cache and unused images older than 168 hours on the shared deployment runner (lines 216–225). This is host-wide housekeeping, not DEV-service-only. Prove its permitted scope and preserve/re-pull the rollback digest from a durable registry; an old local image alone is not rollback protection. If strict staging/production isolation cannot be established, block dispatch and review a candidate-only correction before deployment.

- The existing saved compose must already have one unambiguous WRITER_REPLICAS setting and fenceable web/worker/scheduler services. `dev-writer-fence.mjs` fails closed if not. Current saved compose/scheduler state is NOT VERIFIED. Do not dispatch merely to discover this.
- The automatic fence covers only these three services. Independently exclude other writers and reconcile queues before restore. Keep external ingress/integrations controlled through smoke tests. If queue processing must wait for browser smoke, the current joint-restore workflow does not meet that requirement; approve and validate a narrow candidate-only control change first.
- `storage-init` runs at one replica and can change bucket policies and expiry rules. Include storage backup, private-bucket verification and approved lifecycle effects in the release plan.
- `deploy-dev.yml` lines 910–924 write `/etc/dokploy/beaconhs/collabora-branding.js` and may restart the DEV Collabora service. Prove that host path is not consumed by staging/production. If shared or uncertain, **block deployment and review DEV-only isolation**; do not silently accept cross-environment effects.
- After writer restoration, a readiness failure does not automatically re-fence or roll back. Treat state as uncertain; inspect actual tasks/writes and execute the separately approved containment procedure. Before restoration, a failure must not revive old writers.

Only after all preceding gates and explicit DEV execution approval, dispatch:
`deploy-v1.4-dev-candidate.yml` on **feature/uvanoo-v1.4**, inputs `source_sha=<actual-current-governed-merge-sha>` and `release_evidence_sha256=<approved-manifest-hash>`.
These unresolved placeholders intentionally prevent an executable claim of readiness. No manual bypass or direct Swarm rollout.

Minimum endpoint corrections are the DEV app/migration/super/backup database connections to the verified beaconhs roles/database and DEV Redis to the permanent authenticated service. Preserve HTTPS/auth/sealing secrets, storage and existing network membership. If those dependencies cannot be proven correct, configuration-only recovery is not safe.

## 6. Post-deployment acceptance and recovery

Before admitting normal users/integrations, verify exact running image digest/APP_VERSION, internal ready endpoint and protected external login through Basic Auth. Check full 63-entry ledger, target catalogue/security fingerprint and tenant/data/sequence preservation first.

Use approved synthetic DEV accounts/records only: real authentication; People directory/profile/property scope and denied foreign-property access; Approvals financial fields, upload/download, sequential decisions, delegation, comments, information requests/resubmission, cancellation, audit and CSV; desktop/mobile navigation. Read-only Risk register/revisions/sign-off/export permissions must remain intact; no Risk runtime modification. Verify worker/scheduler ownership, job idempotency and no duplicate notifications. Any mutating smoke requires the later DEV approval.

On failure, restrict ingress, contain writers using the approved DEV-only procedure, preserve logs/failed data and queue state, then select the verified schema-compatible image or approved restore-and-switch route. Account for jobs and writes since backup before switching; do not discard them silently.

## Required owner decisions

No more permission is required for this completed isolated review. Later:
- Identify accessible approved visual references/assets and disposition exact remaining visual differences before freeze; functional acceptance is not being requested again.
- Approve PR9 governed merge at the exact head/base after final checks, including expected image-publication effects.
- Approve authoritative dataset, clean155 and queue reconciliation, any required role/configuration corrections, DEV-only/nonwriter side effects, execution window, fence scope, immutable image and fresh backup/restore manifest digest.
- Approve migration, rollout, synthetic smoke writes and recovery scope separately. Destructive restore/switchover must be explicit. No approval can replace missing compatibility/security evidence.
