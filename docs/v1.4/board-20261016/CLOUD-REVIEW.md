# Uvanoo V1.4 — cloud Board readiness review
Board: Friday 16 October 2026. Review date: 12 October 2026.
Status: REVIEW CHECKPOINT — NOT FROZEN, NOT RELEASE APPROVED.

## Scope and provenance
This review starts from a fresh GitHub clone in an ephemeral cloud executor. No Mac, pre-existing worktree, local handover or persistent database was used.
All outputs are preserved on `review/uvanoo-v1.4-board-20261016-cloud`.
This branch starts at Migration Safety and is for evidence; it does not merge PR #7 or change the governed branch.

| Source | Exact verified SHA |
| --- | --- |
| Governed V1.4 | 6976a851c18e879df1813bb7c18729d6da5ab846 |
| main | 665cf958cb5886eeeaad4f94448504108bcb9bd5 |
| Migration Safety / PR #7 | 6892670fd33e0fe12a1862bb822b451cd1bf7b44 |
| People / PR #4 | 0a4a04ca13758b68068f9483a3c0816b741478d8 |
| Approvals | fed0709f79922d003aefbdb6674e5b92270bdeea |
| Validation registration / PR #5 | 52b2cf64ea4fe99ea1d15175ee611cf0da65be54 |
| Deployment guard / PR #6 | 4bde1df87aa60a4a96c6318af8d53052a2430490 |

PRs #4–#7 are open; #7 is draft. No merge, shared-branch push, CI dispatch, image publication, deployment, seed or persistent DB action was performed.

## Independently reproduced evidence
See cloud-identity-review.json and cloud-node-tests.txt alongside this file.

- Migration Safety is exactly one commit after governed V1.4, with that baseline as its parent.
- 29 changed files with rename detection; Risk SQL 0059–0061 are 100% renames.
- All 61 SQL bodies are byte-identical to governed originals (0059–0061 formerly under prepared/).
- First 58 journal entries are unchanged; 61 unique tags and strictly increasing timestamps.
- All 61 hashes and timestamps match the repository's recorded DEV ledger. This is NOT a fresh live-ledger check.
- People is already an ancestor of governed V1.4. Its 0057 migration and people-provenance.integration.ts are unchanged. Shared RLS differences between People and governed baseline are Risk additions; Migration Safety itself does not change rls.ts.
- Approvals adds exactly 37 files/changes relative to governed baseline. Its unnumbered SQL proposal matches Migration Safety's security fixture byte-for-byte, SHA-256 9d7e47851e1ddf38335826fe0160099e8839d542d18505f141f36653da8c7780.
- 86 dependency-free Node safety tests passed, zero failed/skipped: dev-writer-fence.test.mjs, dev-readiness.test.mjs and v1.4-fast-dev-plan.test.mjs. Executed with executor Node 24.19.0; this is focused evidence, not pinned-toolchain release validation.
- workflow-repository-immutability.test.sh passed.
- Migration Safety diff whitespace check passed.
- Candidate Actions queries returned no runs for the exact People, Approvals or Migration Safety SHAs.
- Existing baseline Full Release run 38153768307 and Fast DEV run 38153768364 are successful; these do not validate the new candidates. Historical DEV deployment run 38172665318 succeeded; current live runtime was not inspected.
- PR #5 CI run 38246134587 and PR #6 CI run 38250343717 succeeded. Those are governance-PR checks, not module freeze evidence.

The first broader identity assertion incorrectly expected the entire shared rls.ts file to equal the older People version. Inspection identified Risk-only additions, and the corrected check compares the unchanged People provenance files and separately records the shared-RLS diff. No source modification was made to obtain a pass.

## Migration Safety review and incremental integration order
The runner reserves a physical connection, preserves the session lock, uses per-migration SQL-plus-ledger transactions and rejects invalid ledger identities. Privilege installation preserves explicit table/column ACLs; backup grants require the canonical non-inheriting, read-only BYPASSRLS backup role and reject elevated ACL drift. Existing recorded PostgreSQL evidence covers fresh/forward/no-op replay, concurrency, rollback/retry, grants and backup/restore.

Recorded evidence in migration-safety-final-validation.txt reports 2,760 tests, typecheck, lint, formatting, build and a disposable PostgreSQL 16.15 harness. That evidence predates this cloud review and is not represented as reproduced here.

Controlled sequence:
1. Keep source candidates immutable. Recheck all refs immediately before any future authorised transition.
2. Reproduce Migration Safety standalone on a disposable cloud PostgreSQL 16 runner: canonical fresh61, 58-to61, already-applied61 no-op, concurrent lock exclusion, SQL and ledger failure rollback/retry, full CLI runner, grants and backup/restore.
3. Run People provenance and six related property-RLS fixtures against that exact source. Include explicit generic property-delegation and Cycas integration opt-ins; skipped tests are not passes.
4. Resolve Approvals production route/adapter and migration gaps on its own isolated descendant. Do not replay People or replace shared RLS wholesale. Retain closed Risk behavior.
5. Assemble a dedicated combined candidate only after individual evidence is green; rerun complete gates and authenticated cross-module/visual acceptance on that combined SHA.
6. Present exact candidate, workflow SHA, evidence and expected migration delta for merge/release decisions. No automatic merge is authorised.

No migration 0062 is reserved. Allocate any Approvals number only against the freshly verified canonical journal; keep the original proposal and fixture hash traceable. SQL registration must precede any production RLS installation that references Approvals tables.

## Workflow safety and approval blockers
- Current main CI deploy-dev is eligible for push OR manual dispatch. Do not manually dispatch ci.yml as a validation workaround.
- PR #6 changes deployment eligibility to a valid main push with non-.github/ changes and fails closed on invalid ranges. It remains unmerged.
- PR #5 registers the isolated workflow but remains unmerged; main currently has no module-validation workflow. It executes from feature/uvanoo-v1.4-ci-validation and checks source ancestry and immutable SHA. It intentionally does not publish images or deploy.
- PR #5's source_branch regex accepts feature/uvanoo-v1.4-*; it does NOT accept chore/v1.4-migration-safety. Do not silently weaken it. A separately reviewed isolated alias or explicit validation extension is needed for Migration Safety.
- PR #5's generic validation is not an Approvals migration/adapter acceptance harness. It cannot establish Approvals readiness while SQL remains unregistered.
- Governed pushes can trigger both Fast DEV and Full Release/image publication. Isolated review branches do not match current push triggers. PRs targeting main can run CI; PR deploy-dev is skipped. No new PR was opened for this checkpoint.
- The GitHub connector exposed here supports read/write repository operations and workflow reruns, but no new workflow-dispatch action. This is an execution capability limitation, not permission to bypass workflow controls.

Registering/changing shared validation controls would require a separately authorised merge under the current no-merge instruction. Full release freeze requires applicable exact-SHA CI, even if focused executor tests pass.

## People and Approvals freeze decisions
| Module | Decision | Remaining evidence |
| --- | --- | --- |
| People | NOT FROZEN | Exact-candidate full CI, real provenance/concurrency and cross-property enforcement, authenticated UI against approved People reference, then combined-candidate regression |
| Approvals | NOT FROZEN | Full worker/web checks; canonical migration and RLS/grant replay; production routes and source adapters; real request/decision/audit/idempotency/concurrency flows; entitlement and property denials; approved visual acceptance |

Approvals is a functioning-engine/fixture-preview candidate, not a DEV-ready module. preview-guard.ts requires development mode, localhost:3103, an explicit flag, loopback database reconcile_fixture and beaconhs_app. preview-server.ts additionally restricts fixture tenant and identities. Keep these safeguards; do not point the preview at DEV. Current actions use a synthetic tasks adapter/audit snapshot. Production maintenance/other source adapters are not supplied by these 37 changes. Spend analytics and CSV/Excel export are explicitly unavailable in the preview. Prior worker typecheck failure is unresolved as a current evidence question until reproduced; it is not claimed fixed.

## Remaining module inventory
Source presence is not runtime/visual acceptance. None of the following is newly certified board-ready by this checkpoint.

| Area | Existing reusable implementation | Board gap / next acceptance proof |
| --- | --- | --- |
| Unified Operations | hospitality dashboard; property diary/tasks; inspection records; hospitality/handover; nav approved-structure.ts | Navigation still separates Daily Hotel, Diary & Tasks, Inspections and Handover. Agree/apply unified entry while preserving permission/entitlement filtering and real endpoints; authenticate complete cross-property handover/task flow |
| Diary recurrence | diary-rules.ts, diary/actions.ts, template create/edit pages and existing scheduler | Only daily/weekly/monthly exposed and accepted; quarterly/yearly absent. Extend parsing, scheduling, create/edit UI, validation, tests, manual and translations together; verify Europe/London DST and due dates |
| Assets / PPM | equipment asset detail, QR labels/scan, _maintenance-actions.ts inspection schedules and reminders | Verify real QR-to-asset, overdue inspection completion and recurring reminder rollover with property boundaries; use existing engine |
| Asset bulk import | packages/sync CSV connector has equipment mapping/upsert | Not evidence of a board-ready Excel/CSV asset import wizard. Validate accessible UI, property mapping, row errors, duplicate strategy, permissions and audit. Native XLSX flow not established |
| Branding Management | Super-Admin-gated platform branding actions/config | Tenant branding action currently requires admin.settings.manage and allows tenant branding writes. New Super-Admin-only requirement is not implemented across UI/actions/help/tests. Audit all mutation paths, including APIs, before claiming closure |
| Guest QR editor | guest/maintenance/[token] uses platform logo/name and existing report form | Layout/copy are hard-coded. No visual maintenance-page editor established; build safe schema-backed preview/save with Super Admin checks and public-page rendering, preserving token validation/rate limits |
| Maintenance | hospitality maintenance list/report/detail and guest room QR routes; equipment work orders | Verify staff/guest report through assignment, status, evidence and closure; inspect links between issue and work-order engines before claiming unified workflow |
| Compliance | compliance dashboard/obligations/expiries plus unified compliance package | Verify actual obligation/evidence/expiry flow, scope and scheduler; approved coral/teal visual acceptance remains outstanding |
| Other modules | Incidents, Action Plans, Training, People, Metering, Reporting/Reports routes in nav registry | Audit real mutations, exports, filters/pagination, permissions and truthful help; do not expose missing/dead controls |
| Risk | Closed governed implementation and SQL identities preserved | Regression-only; no redesign or lifecycle change authorised by this review |

## Synthetic demo and Board run-through
Reuse the existing insert-only Cycas seed design, not a second dataset or reset. It defines Cycas Hospitality, One Fifty Fenchurch (33 rooms), The Lincoln Suites (54 rooms), property-scoped staff, assets/PPM, tasks, maintenance and compliance examples. No seed was executed. The repository's fixed anchor is 15 October; Board is now 16 October. Do not silently change the anchor or existing seed fingerprints; validate date-sensitive demo states in a disposable run.

Proposed acceptance run-through, to be executed and recorded, not presented as already working:
1. Cluster GM switches between both hotels; restricted Lincoln user cannot access Fenchurch by direct URL or manipulated request.
2. FOH reports a room issue; engineer assigns, attaches evidence and closes it; audit and handover reflect the persisted result.
3. Manager assigns recurring operational tasks, completes an inspection, reviews late work and records handover.
4. Scan an asset QR, record an inspection, complete a reminder and verify next due date; import a synthetic file with both valid and rejected rows.
5. Review compliance expiries and supporting evidence without cross-property disclosure.
6. Approvals request and sequential decisions against a real source adapter, with duplicate retries, stale-version and unauthorised-decision denials.
7. Super Admin changes QR-page branding in a preview and saves; tenant admin is denied through UI and direct mutation.
8. Compare desktop/tablet/mobile rendering against committed approved originals and existing Light/Terra coral/teal tokens. Do not generate replacement approvals or use purple.

## Exact-release preflight — outstanding, no DEV action authorised
Require immutable combined source and image digest; exact workflow run; fresh read-only runtime/ledger identity; protected-data inventory and pre/post checksums; verified backup with restore rehearsal; migration compatibility/delta and writer fencing proof; rollback image/config and data-preserving recovery plan; role/RLS/entitlement regression; synthetic-seed collision/no-reset proof; authenticated visual/functional smoke evidence.
People rollback must not reinstate the vulnerable legacy predicate. An image rollback alone does not undo schema/data changes.
Only then request explicit authorisation naming that exact DEV release. Staging and production remain excluded.

## Review checklist
- Confirm source SHAs and migration identities in the adjacent JSON.
- Review workflow registration/deployment-guard blockers before any merge.
- Keep People and Approvals marked NOT FROZEN until complete exact-SHA evidence exists.
- Execute the board scenarios on disposable infrastructure before proposing persistent DEV.
- Recheck the exact combined candidate, rollback and data preservation before requesting release authorisation.

## Cloud execution checkpoint
An additional isolated workflow was subsequently created on the review branch only:
- Workflow control commit: 18cf3bf139ea3610b31c2355abd6bd6f9bee8962.
- Workflow: .github/workflows/uvanoo-v1.4-board-cloud-review.yml.
- Run: https://github.com/Satho82/beaconhs/actions/runs/38271967825.
- Fixed-SHA People and Migration Safety full validation jobs use disposable PostgreSQL/Redis.
- Migration Safety includes its existing network-none/tmpfs Docker regression harness.
- Approvals has explicitly partial static/unit/build evidence only; no migration, production-adapter or visual acceptance claim.
- Trigger is restricted to the review branch and this workflow path; no manual dispatch or merge was needed.
- Permissions are contents: read. No secrets, environment, image-publication or deployment job.
- YAML, fixed matrix identities and shell syntax were checked before publication. Run is in progress at this checkpoint; no pass or freeze is claimed.

This supplements existing gates and does not register PR #5 on main, merge PR #6, or replace mandatory release acceptance.
The earlier no-dispatch limitation remains true for the connector; the branch-specific push trigger supplied a safe supplemental execution path.

PR #6's exact classifier script also passed five independent synthetic Git-history cases: workflow-only, application change, first push, malformed range and reverse history. See deployment-classifier-tests.json.

Additional Approvals reproducibility blocker: verify-approvals-batch01.ts expects named Docker container uvanoo-approvals-reconcile-20261012 and APPROVALS_DEV_CONTRACTS pointing to external captured DEV metadata. No such file was recovered from these 37 committed changes. Do not fabricate the metadata or remove fixture safety checks. A reproducible cloud fixture/contract setup is required.


## First isolated run results and safe corrections under validation
Run 38271967825 completed **failure**. This preserves blockers rather than weakening gates:
- People: format, fresh route types, full 25-task typecheck (including worker), database typecheck, lint, dead-code, fresh migrations, migration idempotence and unit/regression tests passed. Explicit property-delegation integration then failed because the fixture maintenance login cannot SET ROLE beaconhs_app. Later provenance/SQL/build steps did not run.
- Migration Safety: format/typecheck/database typecheck/lint passed; dead-code rejected the unused exported ExecutableMigration type. Later gates did not run.
- Approvals: format/full typecheck/database typecheck/lint passed; dead-code rejected three unregistered verification/preview script files and unused contract exports. The earlier worker-typecheck concern did not reproduce on this exact source.
- See first-cloud-gate-failures.txt and people-first-cloud-result.txt for evidence.

Minimal pending corrections are preserved as migration-safety-deadcode-fix.patch and approvals-deadcode-fix.patch. They make internal types/schemas private and register the existing Approvals scripts as executable package commands; no ignores, SQL, RLS or service behavior changes. On both corrected cloud trees, formatting, full typecheck, lint and dead-code pass. Full tests/build remain in progress and source corrections are not committed or frozen.

The People fixture correction is scoped to the isolated property-delegation step: use the disposable PostgreSQL cluster admin for setup/SET ROLE, while preserving all restricted-app assertions. Do not grant role membership to the production maintenance role or change application RLS.

Executor limitations and retries: the initial full test run lacked Chromium. An isolated npm installation of @sparticuz/chromium@153.0.0 supplies Chromium 153.0.8010.0 without repository dependency changes; all 18 PDF tests then pass unchanged. First build hit the executor memory limit (cgroup OOM kill); a smaller Node heap retry is pending. Neither infrastructure failure is represented as a pass.

No source candidate is frozen. No governed/shared branch, persistent database, DEV release, staging or production was changed.
