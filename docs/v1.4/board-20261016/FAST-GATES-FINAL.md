# Fast Approvals recovery and Operations source-identity closure

Completed: 12 October 2026, 18:08 UTC. Scope: isolated cloud engineering and publication.
Repository: Satho82/beaconhs. Board: 16 October 2026.

## Published corrections

| Candidate | Branch | Commit | Exact validated Git tree |
| --- | --- | --- | --- |
| Approvals | fix/uvanoo-v1.4-approvals-fast-gates-20261012 | 08fa9df055950a0c81798fcfe66f0df7323947b1 | 7115e2d897e2fd4734101253181298c088be44cf |
| Operations recurrence | fix/uvanoo-v1.4-operations-recurrence-20261012 | 14efdd0af50b8c45f0c5096989ea0936e78032d4 | c997017ccec7f68a8071907ed7a0e114ae47d6ed |

Both commits have the single parent d18f635a41f092e9e86aa6f53518f9c28992b0d2. Both branches were created new. No merge or rebase.
Governed HEAD remains d18f635a41f092e9e86aa6f53518f9c28992b0d2; main remains 665cf958cb5886eeeaad4f94448504108bcb9bd5.
Final GitHub inventory showed no in-progress Actions runs.

## Approvals: confirmed failures and corrections

Original failed run: [38283560133](https://github.com/Satho82/beaconhs/actions/runs/38283560133), job 114926400332.
All 13 failures were retrieved from the exact job log:
- One production-cutover test still expected the 61-entry file/journal inventory.
- Four historical Risk plan tests and eight historical read-only adoption tests incorrectly used the new current journal as their exact-61 historical fixture.

Corrections retain explicit migration inventory assertions including 0062. Historical tests now explicitly reconstruct the 61-entry fixture. New cases prove that the historical tool rejects the real 62-entry source/ledger. Neither its live guard nor Risk SQL/policies/runtime behavior was relaxed.
The previously validated localization/dead-code corrections were recovered from immutable saved proposals. English, Spanish and French catalogues independently matched their earlier Git blob hashes.

Canonical 0062_approvals_batch01 is registered after the unchanged original 61 migrations. Its SQL body matches the reviewed proposal after the three header lines.

Evidence:
- [38285410650](https://github.com/Satho82/beaconhs/actions/runs/38285410650), job 114932464899: all substantive gates PASS — focused tests, format, fresh route types, typechecks, lint, dead-code, complete unit/regression suite, migration replay/idempotence, property delegation, 20 real People provenance groups, related RLS, closed Risk revisions, migration rollback/locking/ACL/backup/restore, deployment contracts and production build.
- The PostgreSQL harness proves fresh 62, forward 58-to-62, forward 61-to-62 and no-op cases. The original 61 ledger IDs, hashes and timestamps survive the upgrade exactly.
- That run's overall conclusion remains FAILURE: final recording detected the known Next-generated declaration, and its snapshot had omitted newly added Safety files from a non-indexed patch application.
- [38287478749](https://github.com/Satho82/beaconhs/actions/runs/38287478749), job 114939200325: SUCCESS. Requires every preceding full-gate step to have succeeded at the exact control SHA. Reconstructs the immutable proposal, tracks Safety additions in the index, includes the exact generated declaration, repeats focused contracts/type generation and rejects any other file/hash drift.
- Its recorded tree 7115e2d897e2fd4734101253181298c088be44cf exactly equals the complete published GitHub tree. New blobs were individually checked against runner hashes.
- Governed-to-Approvals difference: 49 files, including the recovered original candidate. No new production module design was attempted.

The full successful test/build evidence was reused; it was not rerun simply to correct final recording.

## Operations: confirmed blocker and correction

Original failed run: [38281652878](https://github.com/Satho82/beaconhs/actions/runs/38281652878). Tests/security/build had succeeded, but its bounded final source guard rejected an undeclared change.
Diagnostic [38285410593](https://github.com/Satho82/beaconhs/actions/runs/38285410593), job 114932464592, identified apps/web/next-env.d.ts immediately after next typegen.

The sole generated difference adds:
`import "./.next/types/root-params.d.ts";`

Baseline blob: 9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38.
Generated blob: ce4e94a6b10f160ee021fe18939af160d2927dcf.

The correction explicitly includes that exact generated file in the bounded proposal. The guard still rejects unexpected paths; it additionally checks every expected file hash at the end and rejects untracked source.

[38285834816](https://github.com/Satho82/beaconhs/actions/runs/38285834816), job 114933865078: overall SUCCESS, including all full quality/security/database gates, production build and final source identity.
Final manifest: exactly eleven files; zero unexpected paths or hash drift. GitHub tree c997017ccec7f68a8071907ed7a0e114ae47d6ed equals the runner-recorded tree.

Recovered behavior and coverage:
- Daily, weekly and monthly forms preserve their existing cron mappings.
- Quarterly scheduling and explicit yearly month selection recovered from the saved proposal.
- Create/edit forms, validation, guidance and en/es/fr text retained.
- Scheduler runtime implementation unchanged.
- Existing occurrence planning, due offsets, catch-up caps, activation/end boundaries and stable idempotency keys preserved.
- London quarterly local-time checks cross both clock changes and the year boundary.
- Annual February checks cover ordinary/leap years and due offsets.
- Invalid recurrence, annual month and impossible calendar-day inputs are rejected.

## Integration and release boundaries

The two independent candidates are ready for controlled integration review. No combined-candidate validation or module freeze is claimed.
Shared paths are only the identical Next declaration and three translation catalogues. New catalogue keys are disjoint in all three languages; preserve both sets when integrating.

Still outstanding outside this recovery scope:
1. Approvals production routes/source adapters, captured-contract acceptance and authenticated visual/functional acceptance.
2. A separately reviewed DEV forward-migration path: current deploy-dev.yml selects the historical exact-61 verify-prepared-risk.ts for feature candidates. It intentionally cannot deploy this new 62-entry chain. No deployment guard was bypassed.
3. Combined candidate validation, authoritative image publication, fresh live preflight, verified backup/restore, approved migration/deployment and Board journeys.

No DEV, persistent database, production/staging, live seed or Mac operation occurred. No existing source branch was overwritten. No integration merge, rebase or deployment was performed.

## Completion checklist

- [x] Exact failures recovered and smallest confirmed corrections applied.
- [x] Original 61 migration identities preserved.
- [x] Disposable PostgreSQL, People isolation and Risk security verified.
- [x] Recurrence/DST/year-boundary coverage passed.
- [x] Published Git blobs and complete trees match cloud validation evidence.
- [x] Dedicated source branches saved; governed/main unchanged.
- [ ] Production Approvals completion, combined integration and DEV release acceptance.
