# Emergency cloud continuation — 12 October 2026

Status: IN PROGRESS. Not a Board freeze or deployment approval. This checkpoint supersedes pending statuses and earlier authorization assumptions in CLOUD-REVIEW.md; earlier evidence remains preserved.

## Recovered and integrated
- Governed branch: d18f635a41f092e9e86aa6f53518f9c28992b0d2, merge of PR #7.
- Parents: 6976a851c18e879df1813bb7c18729d6da5ab846 and befe7efc807230862ac1cbd42ab957e1e298e7f1.
- Tree cac8f1184b7852629aab49e77f49a693abd0e350 is exactly the fully tested corrected Migration Safety tree.
- Original 61 SQL identities preserved, including the three Risk files relocated from prepared/. No SQL body was changed during Safety integration.
- Exact-source run 38278704970 passed for People and Safety, including all full gates, property delegation, 20 People provenance groups, SQL RLS regressions, migration rollback/locking and backup permission/restore checks.
- Governed Fast DEV 38281825816 passed. Authoritative Full Release/image run 38281825733 is still running at this checkpoint. Image publication is not deployment.
- main remains 665cf958cb5886eeeaad4f94448504108bcb9bd5. PRs #5 and #6 remain unmerged; their earlier boundary evidence and unresolved registration details remain valid.

## People
Preserved exact candidate 0a4a04ca13758b68068f9483a3c0816b741478d8. Exact-source gates passed. NOT FROZEN: authenticated visual acceptance and combined-release regression remain required. No new freeze SHA is claimed.

## Approvals
Original candidate fed0709f79922d003aefbdb6674e5b92270bdeea remains preserved.
Localization/dead-code precommit proposal run 38282493823 passed focused Approvals/i18n tests, format, typecheck, lint and dead-code. It then failed canonical migration at RLS installation because approval_workflows was not created by the 61-entry chain. No failing source correction was promoted.
Run 38283560133, control eb18ce86e14a1b6aaf62922c339c7b846b538b8e, adds proposed 0062_approvals_batch01. Its SQL body after three header lines equals the reviewed proposal; all original 61 files/journal identities remain unchanged. The expanded harness retains rollback, lock, Risk and backup tests and adds explicit 61-to-62 ledger-preservation proof. This is a proposal under validation, not applied DEV SQL.
Production routes, real source adapters, full captured-contract proof and authenticated browser/visual acceptance remain open. Preview safeguards are retained. NOT FROZEN.

## Operations and remaining modules
Quarterly/yearly recurrence proposal run 38281652878, control 03c540813d76a83c342abcd080e6f51ac59e9257, extends existing daily/weekly/monthly scheduling. It includes create/edit forms, parser, London/DST and leap-year checks, guidance and English/Spanish/French text. Focused checks passed; complete build is pending. No source promotion yet.
Existing Maintenance, Assets/PPM, Compliance, Dashboard and Reports implementations are retained. Source presence and seed records do not certify live workflows.
The visual guest QR page designer is still missing. The current request requires Platform Super Admin exclusivity for that Platform designer. It does not authorize removal of all existing tenant-branding administration; the earlier broad branding inventory must not be treated as that instruction.
The existing Diary lists/assignment paths need focused review for bounded listing and property-specific assignee eligibility before broader Operations acceptance. This recurrence proposal does not certify those paths.

## Two-hotel synthetic proof
Run 38282657644: synthetic job 114923418950 succeeded; public-readiness job 114923419199 failed HTTP 401, so the overall run is failure.
- Existing insert-only dataset reused, no duplicate/reset seed: One Fifty Fenchurch and The Lincoln Suites, 87 rooms and 19 accounts.
- All 14 rollback-only scenarios passed: dataset preservation, exact replay, property RLS, 11 identity/collision cases, edited-record refusal, late-failure rollback. The successful dataset case includes 19 real password logins.
- A separate dry run used Board anchor 2026-10-16T12:00:00.000Z. Historical defaults/fingerprints were not silently changed.
- No persistent DEV records or credentials were written. This is not browser or visual proof.

## Live access and release stop
The cloud VPS connector reports offline. DEV /api/health/ready responds HTTP 401 to the unauthenticated cloud probe; this does not prove the application is offline.
Fresh runtime/ledger identity, protected-data inventory, production-equivalent backup/restore proof, authenticated live/mobile acceptance and immutable integrated release/digest remain unverified. Do not dispatch deployment, seed DEV, reset data or bypass authentication/gates.

## Resume checklist
1. Inspect runs 38281825733, 38281652878 and 38283560133; retain each failure and exact control/source identity.
2. Promote proposed source only after all applicable precommit gates pass. Recover formatted source and validated tree markers from completed job logs; require identical Git tree.
3. Preserve original People/Approvals candidates, and use governed PRs for integration.
4. Complete production Approvals and remaining module acceptance; then run complete integrated release gates and browser/visual checks.
5. Restore authorized cloud VPS access and execute fresh read-only preflight, verified backup/restore and rollback preparation before any DEV transition.
