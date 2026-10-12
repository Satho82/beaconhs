# DEV release migration gate

This gate applies only to the verified V1.4 DEV candidate path. Ordinary main,
staging and production execution is unchanged. No SQL migration is rewritten.
The historical clean-database verifier remains historical evidence and is no
longer the DEV deployment entrypoint.

## Release contract

Dispatch requires an owner-approved SHA-256 of manifest.json. Store the manifest
and its encrypted backup together under
/opt/uvanoo-dev/release-evidence/EXACT_SOURCE_SHA/. The deployment mounts that
directory read-only. Neither a boolean "backup done" nor a mutable image tag is
accepted. The digest is an authorization input, not generated from the live
database by the deployment. Review the restore-run evidence before approving it.

The ReleaseEvidence type in packages/db/src/dev-migration-gate.ts is the exact
manifest schema. It binds the source commit/tree, image digest, ordered migration
SHA-256 identities, database name/OID/version, independently rehearsed schema
fingerprints for supported starting prefixes and the complete target, encrypted
backup checksum, restored ledger/data/schema fingerprints, restore Actions URL,
and an immutable rollback image. Backup and restore evidence expires after one
hour. Unknown fields do not grant additional permissions.

Create the reference schema fingerprints by replaying the exact source on a
disposable PostgreSQL cluster with the canonical roles and full convergence
phases. Never derive an approved reference by accepting the live catalogue as
correct. Explicitly reconcile legitimate environment-specific role/ACL differences
before approval. Restore verification must compare the backup's ledger, catalogue,
and data with the source snapshot, including ownership/grants reapplied from the
reviewed security contract: repository logical dumps intentionally omit ACLs.

DEV_BACKUP_DATABASE_URL must connect to the same database/server as the migrator,
using beaconhs_backup. The backup role has cross-tenant SELECT, default read-only,
no ownership or DML. Credentials remain repository/environment secrets.

## Execution ordering

The existing control-plane writer fence covers web, worker and scheduler.
Before releasing the fence, the canonical runner must pass:

1. Exact checked-out source, immutable history, journal and approved evidence.
2. Encrypted-backup checksum.
3. Existing role checks and the canonical session migration lock.
4. Strict ordered ledger prefix, database identity and schema/security fingerprint.
5. Backup-role data fingerprint matching the verified restore evidence.
6. Atomic per-migration SQL and ledger commits, with no legacy hash exception.
7. Existing RLS, grants, template, RBAC, reporting and statistics convergence.
8. Exact complete target ledger and approved final schema/security fingerprint.

The complete runner includes data and RBAC convergence; it is never a read-only
check, including when no DDL is pending. Review these effects as part of release
acceptance. Deployment alone cannot certify that a rollback image is compatible;
the recovery plan must identify either a compatible image or a verified database
restore into a separate recovery database. Never delete migration ledger rows.

Fixed demo row counts are not compatibility checks. The gate hashes actual
backup-covered data without publishing it. Data changed after backup is rejected.
No automatic retry, ledger repair, schema adoption or down migration is performed.
After failure, writers stay fenced until an explicit recovery review.

## Integration and recovery prerequisites

This isolated correction branch retains the governed 61-file SQL baseline.
Disposable tests import canonical 0062/0063 from immutable recovered source
937242e7e35806acab48c28c4163719b00c0f16d. Their Git blob identities are locked
alongside all original migrations. A later combined candidate must retain those
bytes and pass the complete release gates. Future migrations require a new
approved manifest and rehearsal; a numerical migration count is not authorization.

The intended persistent DEV endpoints are uvanoo-dev-postgres/beaconhs and
uvanoo-dev-redis. Do not switch secrets or networks until the actual database,
surviving clean-database volumes, tenant-data differences, Redis queues and all
roles have been inspected. This code does not perform those operations.

A missing reference fingerprint, backup, restored evidence, role, schema object,
historical identity or release binding blocks deployment. No live compatibility
or deployment readiness is implied by disposable CI success.
