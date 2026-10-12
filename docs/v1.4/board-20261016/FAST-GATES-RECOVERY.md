# Fast Approvals and Operations gate recovery

12 October 2026. Engineering in progress, not module freeze or deployment approval.

- Governed source remains d18f635a41f092e9e86aa6f53518f9c28992b0d2.
- Failed Approvals run 38283560133 / job 114926400332: 13 failures across production-cutover-integrity.test.ts (one strict migration-list expectation), risk-prepared-plan.test.ts (four historical fixture cases), verify-prepared-risk.test.ts (eight historical fixture cases). Migration 0062 applied successfully before these tests.
- Correction proposal: .github/recovery/fast-approvals-tests.json. The live Risk adoption implementation is unchanged and remains fail-closed at exactly 61 migrations. Historical tests now explicitly use that historical fixture; additional tests reject the actual later 62-entry source/ledger. Cutover inventory explicitly includes 0062. Original 61 SQL bodies and metadata remain preserved by canonicalisation and PostgreSQL harness assertions.
- Previously validated localization/dead-code corrections are replayed from the immutable recovery files, not rewritten.
- Approvals run 38285410650 (control 5ed5dec31cc7b38845ec0bc50f3c6350ac9c8660) passed the corrected focused tests and is executing mandatory full gates.
- Operations diagnostic run 38285410593 / job 114932464592 identified ONLY apps/web/next-env.d.ts immediately after next typegen. It adds exactly: import "./.next/types/root-params.d.ts"; after the existing routes import. Baseline blob 9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38. This explains why the previous bounded source manifest rejected generated output.
- Control 30a1d8ede4a2f53a75a2501f8aa860c536ada1e1 includes the exact generated declaration as an explicit bounded source change. Operations run 38285834816 preserves the unexpected-file guard and additionally compares final file hashes against pre-validation expected hashes. Scheduler implementation unchanged.
- Approvals validation also generates this declaration. If its final new source snapshot guard rejects only this known drift after all substantive gates pass, preserve those completed gate results and close exact source identity separately. Do not rerun successful validation solely to change its final recording step.
- Release blocker found: .github/workflows/deploy-dev.yml selects src/verify-prepared-risk.ts for FEATURE_CANDIDATE_VERIFIED=true. That historical path intentionally cannot adopt the new 62-entry chain. A separately reviewed forward-migration deployment path is required. No deploy-control change is made here.
- No application branch promotion until validated source identity is established. No merge, deployment, DEV seed, live database mutation, Risk SQL/policy/runtime change, or Mac execution.

## Approvals publication checkpoint — 17:59 UTC

- Source branch: fix/uvanoo-v1.4-approvals-fast-gates-20261012
- Source commit: 08fa9df055950a0c81798fcfe66f0df7323947b1
- Exact validated tree: 7115e2d897e2fd4734101253181298c088be44cf
- One parent: governed d18f635a41f092e9e86aa6f53518f9c28992b0d2. No merge/rebase.
- Run 38285410650 passed every substantive static, unit/regression, migration replay/idempotence, real People/property/Risk, rollback/ACL/backup, deployment-contract and production-build gate. Its overall conclusion remains FAILURE because final recording rejected the known generated Next declaration and did not include newly added Safety files in its snapshot.
- Run 38287478749 / job 114939200325 SUCCESS: explicitly required all preceding full-gate steps to be green; reconstructed the pinned changes; staged Safety additions into the manifest; included exact generated Next types; rechecked focused contracts; rejected all other drift; recorded the complete source tree.
- GitHub-created blobs matched every runner-reported blob SHA. The entire GitHub tree equals the runner's 7115e2d897e2fd4734101253181298c088be44cf, not merely a subset of files.
- Governed-to-candidate diff: 49 files, including the recovered original Approvals candidate. Original 61 migration SQL identities remain preserved. Risk adoption implementation, Risk SQL and runtime security behavior were not relaxed.
- This is validation recovery, NOT production Approvals completion, module freeze or deployment approval. Production adapters/routes, captured contract and authenticated visual acceptance remain open.
- Operations 38285834816 is in its production build; source publication remains pending.
- Expected integration overlaps: apps/web/next-env.d.ts (identical generated output) and en/es/fr catalogues (disjoint added keys, independently compared). No combined-candidate validation claimed.
