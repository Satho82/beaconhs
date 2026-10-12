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
