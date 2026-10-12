# Uvanoo V1.4 overnight final release controller report

**Isolated engineering and the scoped authenticated browser matrix are complete. People and Approvals remain ACCEPTED — FREEZE PENDING. DEV execution is blocked pending live evidence and separate approval.**

## A. Exact release candidate

Product branch: `integration/uvanoo-v1.4-approvals-dev-gate-20261012`.
Source: `563fb0e9b79a838a5f394abaffb2f7dc743fc571`.
Git tree: `324c50a60e2cb0639ba920488a150c6531968374`.
Governed `feature/uvanoo-v1.4` remains `d18f635a41f092e9e86aa6f53518f9c28992b0d2`.

Review/evidence branch: `review/uvanoo-v1.4-overnight-release-20261012`. Its containing commit/tree identify this report and the freeze manifests; this evidence branch is not a replacement product/deployment candidate.

All 85 paths in the accepted Approvals delta match source 937242e7e35806acab48c28c4163719b00c0f16d. Protected-source evidence verifies 50 People paths and 49 Risk runtime paths against governed base. All 63 canonical SQL identities, SHA256 hashes, timestamps and journal order are recorded in migration-identity-manifest.json. Actual history includes 0000 and the historical absence of 0033; nothing was renumbered.

Authoritative combined run [38313918871](https://github.com/Satho82/beaconhs/actions/runs/38313918871) remains passing: full release checks, production web/worker builds, CodeQL and incremental Gitleaks. Detailed counts and disposable migration/security/backup evidence are in technical-validation.json. Unchanged successful release tests were not repeated.

## B. Security reconciliation

Exactly three supplemental generic-api-key findings were individually reviewed: one synthetic RBAC test identifier and two documentation-prose matches. All match unchanged governed-source blobs; no genuine secret was identified in these three findings. security-reconciliation.json records precise locations, Git blobs and rationale.

Raw full-source runs 38314216302 and 38314349634 remain FAILED and preserved. Review status is RECONCILED FALSE POSITIVES, not a rewritten green raw scan, zero-alert claim or waiver. No scanner rule/configuration, suppression or CI gate was weakened.

## C. Authenticated browser results

- Core run [38318803277](https://github.com/Satho82/beaconhs/actions/runs/38318803277): **35/35 checks passed**, 30 screenshots, zero captured page errors. All six synthetic roles authenticated through the real password UI and production server sessions. Both One Fifty Fenchurch and The Lincoln Suites were exercised.
- Desktop People/Approvals menu clicks passed in run 38319543537; that run's other failures remain recorded.
- Qualified financial-field step in [38320245029](https://github.com/Satho82/beaconhs/actions/runs/38320245029) passed: exact supplier, separate description, category, GBP amount and property persisted correctly. The overall run failed an independent harness step; it is not represented as wholly green.
- Final focused run [38320812403](https://github.com/Satho82/beaconhs/actions/runs/38320812403): **6/6 passed**, including three necessary fixture logins, real mobile menu navigation to both modules, and property reassignment with same-session scope changes, restoration and audit.
- Core coverage includes People profiles and foreign-property denial; two-stage workflows; financial limits; PDF upload/download; request isolation; comments; information requests/resubmission; manual reminders; sequential decisions; cancellation; delegation/original-stage history; reporting/CSV; and responsive layouts.

Verified harness corrections: production HTTPS origin with trusted disposable TLS, tour/splash readiness, qualified form selectors, correct property picker/mobile drawer, and a controller-authored collection-query replacement error. No application runtime bug was established or patched. Earlier rejected burst logins lacked status capture; rate limiting remains an inference, not a proven historical 429.

The final screenshots were inspected. Light surfaces, navy text/icons, teal controls and coral active navigation are present. The Approvals composite reference was retrieved and compared qualitatively; exact pixel/layout parity is not claimed. People originals were located and text read but the available cloud route returned asset pointers without inspectable pixels. Exact User Accounts Option 2 and approved release branding assets remain unverified. No fabricated original comparison.

Automatic reminder timing and actual recipient notification/email delivery were not verified by browser; preserved integration coverage is separate. The browser matrix is scoped, not an exhaustive claim about every module action. No live DEV browser test was performed.

browser-evidence-index.json records reports, job IDs, original failures, artifact IDs/digests/expiry and screenshots. Selected real captures are committed under screenshots/; originals remain in Actions artifacts.

## D. People freeze

**ACCEPTED — FREEZE PENDING.** Owner acceptance dated 12 October 2026 is preserved. Runtime/provenance/security and tested browser behaviour remain intact. Blockers: direct comparison to original People pixels/approved User Accounts Option 2, and exact approved branding configuration. See people-freeze-manifest.json.

## E. Approvals freeze

**ACCEPTED — FREEZE PENDING.** Owner acceptance dated 12 October 2026 is preserved. Technical and scoped browser evidence pass. Exact release branding and full approved visual mapping beyond the qualitative composite comparison remain unresolved. See approvals-freeze-manifest.json. The combined-freeze-manifest.json explicitly has frozen=false.

## F. Governed integration

Draft [PR #9](https://github.com/Satho82/beaconhs/pull/9) targets feature/uvanoo-v1.4 from the exact product candidate. GitHub reported mergeable/clean, 96 changed files and unchanged expected head/base. Overnight harness/evidence files are excluded from this PR.

No merge occurred. GOVERNED-INTEGRATION.md records the owner-approved future procedure: re-read exact heads/diff/triggers; ordinary history-preserving merge; expect the same product tree if base stays unchanged; run authoritative feature validation/image publication for the new merge SHA; bind its exact OCI digest before separately approved DEV execution. Main/staging/production behaviour was not changed.

## G. DEV recovery readiness

**Prepared, not executed. Live compatibility NOT VERIFIED.** VPS connector is offline. Supplied facts identify beaconhs on permanent uvanoo-dev-postgres and permanent uvanoo-dev-redis as intended endpoints, subject to live DNS/network/data/queue checks. Basic Auth 401 is expected and is not application readiness evidence.

Do not equate 58 rows with a canonical prefix. Require full ledger hash/timestamp/order comparison, normalized schema/roles/ACL/default privileges/RLS/trigger checks, tenant/provenance/data/sequence checks, and a restore rehearsal on PostgreSQL 16.15. Preserved combined CI used pinned 16.14.

Resolve clean155 volume/backup divergence and authoritative tenant data; reconcile Redis queues and scheduler ownership without blind replay or flush. Fence every writer, create an encrypted restricted-role backup, restore it independently, prove data/security and rollback compatibility, and approve the exact evidence-manifest digest. Bind post-merge source/tree/image/database identity. No down migration or ledger deletion. DEV-RECOVERY-PREFLIGHT.md and READ-ONLY-PREFLIGHT.sql contain the reviewed proposal; the SQL was not executed.

No OCI release image was published by this controller. The retained standalone runtime is only a disposable browser artifact.

## H. Complete Platform Build handover

COMPLETE-PLATFORM-HANDOVER.md and platform-build-inventory.json preserve all 18 approved groups and 424 reference route blobs verified against the candidate. The coordinated plan preserves Light/Terra, hospitality tenant/property architecture, shared BeaconHS engines, unified Operations, consolidated Maintenance, Assets/PPM QR/reminders/import, and Super Admin-only visual QR reporting administration. No new module development began. Route inventory is not a claim of feature completeness.

## I. Blockers and exact future owner decisions

No additional permission is needed for the isolated work already completed.

1. Resolve the documented original-reference/branding evidence, or explicitly disposition those visual limitations, before formal freeze. Existing functional acceptance is not being requested again.
2. Approve governed integration of exact PR head 563fb0e9b79a838a5f394abaffb2f7dc743fc571 after rechecking base/head and final evidence.
3. Separately approve the authoritative DEV dataset/queue disposition, exact post-merge image, writer-fenced window, encrypted backup/verified restore manifest digest, DEV-only endpoint changes, migration/deployment and rollback scope. Any destructive restore/switchover must be explicitly included.

Live VPS data, full 58-entry ledger, current deployed image and live schema/security are unverified. Broader cloud-worker inventory is unverified because the Codex task inventory tool failed; GitHub Actions were inspected, and no queued/in-progress runs remained at final inspection. No conflicts or concurrent writes were observed on the controlled branch; every ref update used an expected-head lease and force=false.

## J. Recovery checkpoints and closeout

Use this report's immutable containing Git commit and the sibling combined freeze manifest as the recovery checkpoint. Product candidate, core/focused run links and PR9 above are independent immutable evidence anchors. Read RECOVERY.md before continuation.

- [x] Preserve product SHA/tree, People/Risk and all canonical migrations.
- [x] Retain full release, security triage and actual browser evidence.
- [x] Publish isolated review checkpoints, draft PR and DEV/platform handover.
- [x] Record harness defects, corrections, failed runs and passing replacements truthfully.
- [ ] Close visual freeze gaps; obtain separate governed merge and DEV execution approvals.
- [x] No governed merge, deployment, persistent writes, VPS/Docker changes, Risk changes, scanner bypass or force-push.
