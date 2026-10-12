# DEV recovery preflight and execution proposal

**Prepared only. Live VPS/database checks NOT VERIFIED; no recovery operation executed.**

## Fixed candidate and known infrastructure evidence

Candidate 563fb0e9b79a838a5f394abaffb2f7dc743fc571, Git tree 324c50a60e2cb0639ba920488a150c6531968374; engineering run 38313918871 passed. All canonical SQL/journal bytes are preserved. Owner supplied PostgreSQL 16.15, database beaconhs, 58 ledger entries, permanent postgres/redis healthy at last inspection; missing clean155 Postgres and stopped clean155 Redis referenced by Web/Worker, which were 0/1. These are recorded facts, not new live observations. Public proxy Basic Auth 401 is expected and not application readiness.

Intended endpoints: uvanoo-dev-postgres:5432/beaconhs and uvanoo-dev-redis:6379, subject to live network/DNS/queue validation. No environment values or network configuration have been changed.

## Read-only compatibility inspection

Use READ-ONLY-PREFLIGHT.sql as a reviewed query inventory; it has not been executed. Do not call migrate.ts/migrate-dev.ts as a diagnostic: even with no pending SQL they perform writes and security/data convergence.

Compare the complete existing ledger in ID order against sourceMigrations from this immutable candidate. Require a strict prefix, exact SHA256 SQL hashes and timestamps, increasing distinct positive IDs, and source journal order. Reject missing/unknown/altered/duplicate/ahead history, not just wrong counts. Do not assume 58 means the first 58 canonical entries. If it does match exactly, the pending journal is 0059, 0060, 0061, 0062 and 0063 in canonical order. No ledger repair, renumbering or down migration.

Rehearse full canonical convergence on disposable PostgreSQL 16.15 with independently reviewed roles and reference catalogue fingerprints for 58 and 63. Combined CI used pinned 16.14; it is evidence of the code path, not exact DEV catalogue equivalence. Approvals 0063 also changes constraints/statuses/trigger functions; review existing records against new constraints in the restore rehearsal.

Inspect owner/ACL/default privileges, database/schema ownership, role membership, role settings, column privileges, functions, triggers, RLS/FORCE RLS/policies, extensions, tables/indexes/views/sequences, constraints and database settings using the gate's complete normalized catalogue query set. The accompanying SQL is an inspection inventory, not a substitute for the exact gate fingerprint.

Required separation: beaconhs_owner NOLOGIN; migrator non-super/non-BYPASS with reviewed SET ROLE owner membership; app non-super/non-BYPASS, no owner membership; maintenance isolated non-super BYPASSRLS; backup non-super, cross-tenant SELECT/BYPASSRLS, default read-only, no DML/DDL/ownership/elevation. Test backup write denial even with read-only setting disabled on a disposable restored database. Do not blindly replay broad provision grants.

## Recover and reconcile authoritative data

Inventory existing persistent PostgreSQL volumes, clean155 remnants, logical backups and retained containers without starting/restarting them. Identify the most recent authoritative tenant dataset by timestamp and content/provenance, not database name. The extra uvanoo_dev database reportedly has zero public tables and is not an automatic replacement.

Compare tenant/person/property/approval/risk counts, source IDs, created/updated provenance, attachments and object-storage keys/checksums. Preserve all divergent data before any merge decision; no automatic overwrite or imports. No tenant records or credential values should appear in public GitHub evidence. Keep encrypted private evidence and publish only metadata/digests.

For both Redis datasets: identify queue namespaces, pending/delayed/repeatable/active/failed/completed work, task IDs, scheduler ownership and locks. Reconcile jobs against authoritative PostgreSQL state and exact worker version. Define retain/replay/quarantine decisions with idempotency proof. No flush, purge, blind queue-copy, duplicate scheduler or automatic worker reconnect.

## Backup, fence and restore readiness

Plan a separately approved window. Fence all writers, including web, worker, scheduler, API integrations, cron/import jobs and direct clients, before taking the authoritative snapshot; verify no active writes. Preserve old source/image/config references, roles/grants/default ACLs, extension versions, storage metadata and Redis recovery evidence.

Create a consistent logical backup with the restricted backup role, encrypt immediately using an approved age recipient, restrict files/directories and verify checksum. Repository logical dumps omit ownership/ACLs: restore the reviewed role/ownership/ACL contract explicitly into a separate disposable recovery database. Do not store plaintext dumps or private keys in GitHub.

Restore-test the exact encrypted archive. Compare full ledger, normalized schema/security, tenant data fingerprints, sequence state and application smoke evidence. Record recovery duration, acceptable RPO/RTO and storage/queue dependencies. Prepare either a demonstrably schema-compatible rollback image or an isolated restore-and-switch plan. Never revert SQL by deleting ledger rows or overwriting the original database. No automatic image downgrade after forward schema changes.

Prepare release-evidence/EXACT_SOURCE_SHA/manifest.json and encrypted archive. Manifest schema is ReleaseEvidence in packages/db/src/dev-migration-gate.ts. Bind exact source SHA/tree, OCI image digest, full ordered migration identities, database name/OID/version, reviewed prefix/target catalogue hashes, encrypted archive hash, original/restored ledger/data/schema hashes, restore run URL and rollback image digest. The owner approves the manifest SHA256. Evidence expires after one hour; plan restore/fence timing accordingly. Verify DEV_BACKUP_DATABASE_URL targets the same server/database via beaconhs_backup without exposing it.

## Proposed execution sequence — separate approval required

1. Complete browser/visual acceptance and governed integration approval; do not merge main.
2. Governed merge commit receives fresh authoritative feature validation and immutable image publication. Bind the actual post-merge SHA/tree/digest; isolated branch evidence cannot bypass the current-head guard.
3. Revalidate live state and reconcile data/queues; establish writer fence and verified current backup/restore manifest.
4. Apply the minimum reviewed DEV-only endpoint/role connection corrections. Verify network reachability without mixing main/staging/production secrets.
5. Run the canonical gated migrator once under its advisory lock. Keep per-migration SQL+ledger atomic commits and full RLS/RBAC convergence. Unexpected schema/data/history/evidence blocks execution.
6. Verify complete target ledger, target security fingerprint, required roles/grants/triggers and data preservation before restarting any writers.
7. Start the exact immutable web/worker/scheduler release in controlled order; verify internal readiness and exact source identity. Keep fence if migration or postflight fails.
8. Smoke real authorized login, People directory/profile/property scope and denied cross-property access; Approvals workflows/financial requests/document access/decision/audit/exports; Risk register/revisions/sign-off/read/export protections; worker notifications and no duplicated jobs. Public Basic Auth 401 alone neither passes nor fails these checks.
9. Release fence only after accepted health/security/data smoke evidence. On failure stop new writes, preserve failed state and logs, and execute only the approved rollback/restore plan.

## Mandatory owner decisions

No further approval is required for isolated documentation and disposable tests. Before persistent operations, separately approve the authoritative dataset/queue reconciliation, governed integration, exact post-merge source/image, encrypted backup/restore manifest digest, DEV-only endpoint corrections, execution window/fence, migration and rollback plan. Destructive restore/switchover must be explicitly covered. Until then DEV recovery/deployment is NOT AUTHORISED by this report and live compatibility remains NOT VERIFIED.
