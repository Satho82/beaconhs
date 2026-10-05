# Uvanoo V1.4 Fast DEV CI V1

FAST DEV GREEN ≠ RELEASE APPROVED

## Purpose and authority

Fast DEV provides broad development feedback without production compilation,
Docker image building, GHCR publication or deployment. Full Release remains the
only authoritative candidate validation/publication path. Its trigger, checks,
concurrency, candidate verifier and deployment behaviour are unchanged.

Work Package A remains separately identified by frozen SHA
`3f564ab9f9d9a74c7ada3c572580119e7e460350`. A later Fast DEV or Full Release run
does not retrospectively validate that frozen commit.

## Trigger and runner demand

`.github/workflows/uvanoo-v1.4-fast-dev.yml` runs on pushes to
`feature/uvanoo-v1.4`, with no path exclusions and no manual/PR duplicate trigger.
It requests one GitHub-hosted `ubuntu-latest` validation runner. Its independent
`uvanoo-v1-4-fast-dev-${{ github.ref }}` concurrency group cancels stale Fast DEV
runs only. Full Release concurrency is untouched.

Both workflows may run on the same push during this additive introduction.
Removing automatic Full Release feature-push work requires separate approval
after Fast DEV has executed successfully and been compared with Full Release.

## Source, baseline and classification

Checkout uses the immutable event SHA, full history and no persisted credentials.
The workflow verifies repository, feature ref and exact checkout SHA. Failure to
establish source identity fails validation.

The comparison baseline is the fixed Work Package A SHA above. This cumulative
comparison deliberately retains earlier feature changes even when intervening
runs fail or are cancelled. Missing history, discontinuous ancestry, malformed
diffs, unknown files and empty comparisons select broad fallback. The workflow
summary reports repository, ref, SHA, baseline, categories and selected plan.

Categories are additive: DOCS ONLY; UI PRESENTATION; WEB LOGIC; SHARED UI;
DATABASE; RLS / AUTHORIZATION; WORKER; STORAGE; IMPORTS; WORKFLOW / DEPLOYMENT;
SHARED / UNKNOWN. Renames include both paths; deletions retain original impact.
Only root `README.md` and Markdown under `docs/user-guide/` or `docs/screenshots/`
are allowlisted as ordinary documentation. Other documentation, including
`AGENTS.md` and CI policy, is conservative shared/unknown impact.

**V1 executes the same broad gates for every category, including docs-only.**
Classification reports risks and prepares future selection; it cannot remove a
gate. No affected-package or filename-proximity test optimisation is enabled.

## Checks and order

1. Verify source identity.
2. Set up manifest-pinned pnpm and `.nvmrc` Node; verify both exact versions.
3. Install with `pnpm install --frozen-lockfile` using the pnpm store cache.
4. Report classification; run classifier and Fast DEV workflow contracts.
5. Run full `pnpm format:check`.
6. Generate current route types with `next typegen`, without production build.
7. Run full `pnpm typecheck`, existing `pnpm lint` and `pnpm deadcode:check`.
8. Provision disposable CI roles, run migrations, then run migrations again.
9. Run all existing package suites with `pnpm test`.
10. Run deployment-host, current-main, repository-immutability and candidate
    deployment regression contracts.
11. Require every planned step's outcome and conclusion to be successful.

GitHub initialises disposable PostgreSQL/Redis services before job steps. Their
availability does not authorise any external database access. SQL execution is
sequential. Service images use the existing pinned digests and connections use
fixed localhost URLs and `beaconhs_test`. Runtime, migrator, owner, maintenance
and backup roles preserve the existing CI separation and RLS restrictions.

The repository pins Node 24.18.0 and pnpm 10.30.3 at introduction. The workflow
reads the checked-out configuration rather than inheriting runner versions.
The lockfile, rather than a remembered framework version, determines Next.js.
Route types start from a fresh checkout without restored `.next` state. Any
unexpected application TypeScript/Next configuration mutation fails the gate.

Existing lint currently covers web's declared ESLint task. All-package tests
mean the repository's existing scripts, including their explicit opt-in skips;
this does not claim new executable property/RLS coverage. Security/release
requirements are not waived.

## Security and result interpretation

The workflow has only `contents: read`; no deployment secrets, environments,
package-write authority, SSH, VPS or Dokploy operations. Only disposable local
service credentials are embedded. No DEV/staging/production database is used.
The only reused cache is pnpm's dependency store. No task-success, database,
generated-route or release-image cache can substitute for execution.

The final step uses `always()` and checks every mandatory outcome/conclusion.
Failure, cancellation, skipped/missing steps and a failure hidden by
`continue-on-error` cannot produce a green aggregate. GitHub cancellation of the
whole run remains cancelled, never green. If setup fails before the aggregate
can execute, the job is still unsuccessful.

Green means broad **development validation** passed for the displayed SHA. It
does not prove production bundling, runtime-image behaviour, security workflow
completion, visual parity or deployability. No candidate image is published.
The unchanged candidate verifier only accepts the existing authoritative cloud
workflow's validation/publication jobs and SHA-bound image digest.

An executed failing check is a validation failure. An unassigned runner or
hosted-runner incident is missing execution evidence, not a source failure or
success. Do not repeatedly rerun during an active incident. Record
`FAST DEV V1 IMPLEMENTED — AWAITING HOSTED RUNNER RECOVERY` when appropriate.

## Development cadence and adoption

Use focused implementation batches, focused pre-push checks, Fast DEV feedback
and corrections, then require exact-SHA green before closing a development batch.
Full Release is mandatory for coherent candidate acceptance, board candidate
freeze, main/release closure and any deployment.

Compare Fast DEV and Full Release on the same new SHA after hosted runners
recover. Record queue separately from setup and execution. Do not infer faster
runner allocation from shorter validation. V1's broad coverage is intentional;
parallelisation, task caches and selective tests require later measured work.

## Focused implementation verification and rollback

Run Node syntax checks and classifier tests; the Fast DEV shell contract;
actionlint; YAML parsing; Prettier on the five supported changed files; Bash syntax;
existing candidate/immutability contracts; and `git diff --check`. Review
permissions and verify the protected Work Package A/release files have no diff.
No production build is needed merely to verify this workflow addition.

The Fast DEV contract fingerprints the reviewed Full Release workflow and
candidate verifier. An intentional future change to either must explicitly
update those expectations after review; never remove the identity checks to
silence a failure.

Rollback the dedicated Fast DEV commit to remove its workflow, classifier,
contracts, documentation and narrow policy change. Existing Full Release
triggers and runtime infrastructure require no restoration because V1 does not
change them. Do not roll back or overwrite unrelated feature work.
