# Board DEV preflight and rollback decision — 16 October 2026

Decision: HOLD. No deployment, persistent seed, writer-fence mutation or restore was executed during this recovery.

## Release identity
Current integrated infrastructure source is d18f635a41f092e9e86aa6f53518f9c28992b0d2 (PR #7). It is not yet the complete Board release. Full Release run 38281825733 must finish both validation and immutable image publication. Record the final combined source, image digest, OCI revision/version and authoritative run only after remaining modules and acceptance are complete. Never deploy a moving branch or infer an image digest from a tag.

Use the existing candidate dispatcher and docs/UVANOO-V1.4-DEV-WRITER-FENCE.md. Its current-head check, exact authoritative-run lookup, image-label checks, deployment concurrency and fail-closed writer fence remain mandatory. PR #5 validation registration and PR #6 main-deploy classifier remain separate, unmerged governance changes.

## Required evidence before dispatch
| Gate | Current evidence | Release decision |
| --- | --- | --- |
| Canonical 61 migration identities | All SQL bodies retained; exact-source replay/forward/no-op/locking/rollback passed in disposable databases | Fresh live ledger still required |
| Risk and backup permissions | Real disposable ACL denial/drift tests and backup/restore passed | Repeat live role/ACL inventory without broadening privileges |
| People | Immutable source tests and property/provenance checks passed | Browser/visual and combined-source acceptance pending |
| Approvals | Original 18 property-authority tests passed; localization correction passed static/focused gates | Registration proposal running; production routes/adapters and browser checks open |
| Operations | Existing implementation retained; quarterly/yearly proposal under full validation | No blanket Operations acceptance |
| Two-hotel seed | 14 rollback-only scenarios, 19 password logins, Board-date dry run passed | No persistent seed authorized by test success alone |
| DEV readiness | Unauthenticated endpoint returned HTTP 401 | Authenticated exact-SHA readiness not verified |
| Cloud operator access | VPS connector offline | Fresh runtime/DB/backup inspection blocked |
| Integrated release and image | Not assembled | HOLD |

## Data preservation and backup
Before any migration, inventory the actual DEV runtime source/image, canonical role identities, ordered migration ledger, tenant/property IDs and protected business records. Record stable counts/checksums for People provenance, Risk revisions/signoffs, approvals if present, operational work, documents/attachments and the existing seed manifest. Inspect actual schema before assuming Approvals is absent.

Use scripts/cluster/backup.sh with the canonical backup role and configured encryption. The plaintext exception used by isolated test containers is not a DEV instruction. Keep backup credentials and data outside repository logs. Verify archive/checksum, then use scripts/cluster/restore-verify.sh against an isolated restore target. Record artifact location, time, restored schema/ledger and evidence that protected records remain available. A disposable synthetic restore does not substitute for this live backup.

Only after these proofs should the existing writer-fence runbook be applied. Preserve saved Compose/configuration and old immutable image identity before fencing. Require two observations of zero web/worker/scheduler writers and recheck immediately before migration. Never disable RLS, grant broad write rights to backup roles, reset migrations, truncate records or replay a seed with a changed fingerprint.

## Expected migration delta
Safety integration preserves the original 61 SQL identities; a live database already at that exact chain should be a no-op. Fresh live identity must prove that expectation.
Proposed Approvals 0062 is additive and not accepted or applied yet. If selected later, prove exact 61-to-62 transition and existing-table compatibility before dispatch. An unexpected Approvals table without its registered ledger identity is a blocker, not permission to adopt or skip it.

## Rollback and failure handling
Capture the previous image digest and saved configuration. Image rollback is permissible only if schema compatibility is demonstrated. Never use an older image that reintroduces the unsafe People provenance predicate.
If migration or candidate rollout fails, retain the persisted zero-writer state and inspect both Dokploy and Swarm before recovery. Do not blindly restart old writers. Failed SQL-plus-ledger transactions must roll back together; verify the actual resulting ledger before retry.
A database restore is a separate, potentially destructive recovery decision. Preserve current state and determine whether accepted writes occurred after the backup; do not overwrite them automatically. Prefer a forward correction when it preserves data and is fully validated.

## Board walkthrough acceptance
Use synthetic accounts for both hotels. Record desktop, tablet and mobile results for login/navigation, denied cross-property direct URLs, staff/guest maintenance report-to-close, asset QR inspection/reminder, import row errors and duplicate handling, obligation/evidence/calendar, task recurrence/sign-off/handover, and sequential real-source approvals with retry/revocation denials.
Compare against the existing Light/Terra references. Label guarded Approvals previews and missing QR designer capability explicitly. A seeded record or visible button does not prove its workflow is operational.
