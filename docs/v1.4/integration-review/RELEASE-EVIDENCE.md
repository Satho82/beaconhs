# Uvanoo V1.4 combined release integration review

Status: Engineering validation passed; release acceptance pending browser proof, supplemental scanner reconciliation and live DEV preflight.

## Immutable sources

| Input | Commit | Git tree |
| --- | --- | --- |
| Governed base | d18f635a41f092e9e86aa6f53518f9c28992b0d2 | cac8f1184b7852629aab49e77f49a693abd0e350 |
| Approvals Production | 937242e7e35806acab48c28c4163719b00c0f16d | 9912feac29a30b4b32d219b4cc21f80f1f57f7f7 |
| DEV migration gate | ba3f87000b7d2ace82ee74aa1585a91e4237c0af | ccc96eee2803ec9fd6d17444a0d4bd667a848411 |
| Combined candidate | 563fb0e9b79a838a5f394abaffb2f7dc743fc571 | 324c50a60e2cb0639ba920488a150c6531968374 |

Candidate branch: `integration/uvanoo-v1.4-approvals-dev-gate-20261012`.

The two inputs have no directly overlapping changed files. The combined candidate contains 96 changed files relative to the governed base. All 63 migration SQL blobs and the journal match Approvals Production exactly; all baseline SQL identities are preserved, including historical numbering. People and Risk runtime bytes remain unchanged. The combined merge commit is 6f7048965e8136aaf4067555e93fc048ef2cecb5; its only follow-up changes the disposable DEV integration fixture.

## Integration correction

Run 38313183476 correctly failed because the fixture attempted to install current Approvals RLS while constructing a pre-0062 database. The correction constructs 58/61-entry fixtures with the governed runner/RLS, and 62-entry fixtures with canonical batch01 runner/RLS, then restores combined source before forward execution and security assertions. It does not suppress missing-table errors, alter runtime RLS, modify SQL, or remove assertions.

The copied DEV-MIGRATION-GATE document describes the original isolated correction's 61-file baseline. This combined candidate now contains the canonical 63-file chain; this evidence record is the integration-specific status.

## Validation

[Exact combined release run](https://github.com/Satho82/beaconhs/actions/runs/38313918871): SUCCESS.
Control commit: 4e6095032db739ade1fdc43ca9d46a7e2a1b9803.
The jobs check out 563fb0e9b79a838a5f394abaffb2f7dc743fc571, verify tree 324c50a60e2cb0639ba920488a150c6531968374, and verify clean tracked/untracked source after validation.

- Formatting, fresh route types, workspace/database typechecks, lint, dead-code and deployment contracts passed.
- Workspace tests: 23 successful tasks. Database: 392 tests passed. Web: 1738 passed, one existing opt-in skip; the property-delegation integration was separately run successfully.
- Web and worker production builds: 2 successful tasks.
- Disposable strict-prefix paths 58, 61, 62 and 63 to 63 passed, with exact hashes/timestamps/order and schema/ACL/role/trigger drift rejection.
- Full canonical runner fresh, no-op, 58->63, 61->63, 62->63 and existing63 paths passed. Existing ledger identities preserved.
- Approvals: 29 lifecycle checks plus concurrent decision/delegation, notification recipient revocation, queue idempotency and automatic reminder checks passed.
- People provenance, property and tenant isolation, and Risk immutable-revision SQL checks passed.
- Backup SELECT/no DML/no escalation, repository backup and restore verification, atomic failure rollback, retry, hash/duplicate rejection, and concurrent migration exclusion passed.
- Existing Gitleaks action and CodeQL security-extended jobs succeeded. CodeQL success establishes completed analysis/upload, not independently a zero-alert claim.
- Pinned disposable PostgreSQL reported 16.14. Supplied persistent DEV version is 16.15: live release evidence must bind the actual version and rehearse its catalogue/security fingerprint.

## Supplemental complete-source scan

[Full snapshot diagnostic run](https://github.com/Satho82/beaconhs/actions/runs/38314349634): FAILED on three generic-api-key findings. This supplements the existing last-commit-diff scan. No exclusions, suppressions or bypasses were added.

| File | Line | Review |
| --- | --- | --- |
| apps/web/src/lib/property-delegation.integration.test.ts | 89 | Synthetic role key; non-secret |
| docs/UVANOO_V12_INTEGRATION.md | 28 | Documentation table prose; apparent false positive |
| docs/v1.4/V1.4_ARCHITECTURE_DECISIONS.md | 141 | Documentation table prose; apparent false positive |

All three files are byte-identical to the governed base. Keep raw scan failure visible; reconcile narrowly reviewed non-secret findings with scan policy before declaring all security checks green. Do not use broad path exclusions or disable the rule.

## Browser acceptance blockers

[Prior browser run](https://github.com/Satho82/beaconhs/actions/runs/38310507071) built Approvals source 937242e but failed application startup/readiness before browser tests. The application log was not captured in the available artifact, so the underlying cause remains unverified. Exact combined-candidate authenticated People/Approvals browser acceptance is pending. No freeze or owner acceptance is inferred.

## DEV preflight and approvals

The VPS connector was offline. No persistent database or VPS inspection was possible. GitHub Actions had no queued/in-progress runs at the start. Broader Codex task inventory failed, so absence of other cloud workers cannot be certified.

Before any DEV change:
1. Read and compare the actual 58-entry ledger, schema, roles, ownership, grants, RLS, data and database identity. Count alone is not compatibility.
2. Reconcile persistent beaconhs data with surviving clean155 volumes/backups and Redis queues. Confirm intended uvanoo-dev-postgres/beaconhs and uvanoo-dev-redis endpoints.
3. Rehearse the exact accepted source on the actual PostgreSQL version; approve reference schema/security fingerprints independently of live drift.
4. Create and restore-test the encrypted backup under a writer fence. Bind checksum, ledger/data/catalogue fingerprints, source SHA/tree, immutable image digest and rollback image/restore plan. Evidence freshness is limited to one hour. Verify restricted backup-role connection and read-only evidence mount.
5. Preserve migration lock, atomic SQL/ledger commits, full RLS/RBAC convergence, postflight verification and writer fence on failure. Do not delete ledger rows or run down migrations.
6. Complete browser acceptance and supplemental scan reconciliation.
7. Obtain separate approval to integrate the exact candidate into governed V1.4. The DEV dispatcher intentionally requires the governed branch's current exact head, authoritative feature CI and immutable published image; this isolated validation does not bypass it.
8. Obtain a separate explicit DEV recovery/migration/deployment approval covering accepted source/image, approved evidence digest, endpoint corrections, writer fence, recovery window and rollback plan.

No additional approval was needed for this completed isolated review. No governed merge, deployment, persistent writes, DEV configuration, Risk runtime, historical SQL, staging or production changes occurred. No image was published. No force-push occurred.
