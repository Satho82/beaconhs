# DEV candidate writer fence

The manual candidate dispatcher must run from the current
`feature/uvanoo-v1.4` head and accept that same fully validated source SHA.
Superseded candidates and dispatches using older governance are rejected.
Pushing runs validation and image publication only; it does not deploy.

## Deployment ordering

1. Verify the candidate, immutable image, canonical DEV target and prerequisites.
2. Validate that the existing saved Compose uses `WRITER_REPLICAS` for web,
   worker and scheduler only. Preserve the existing Compose and all other values.
3. Persist `WRITER_REPLICAS=0` using Dokploy `compose.update`, then read it back.
4. Apply the saved fence through `compose.deploy`.
5. Require two consecutive observations of zero desired replicas and no active
   tasks for all three services. Inspect actual task state, including tasks
   whose desired state is shutdown. Unknown states cannot pass as stopped.
6. Run the existing migration connectivity and identity checks using the GitHub
   `DEV_MIGRATION_DATABASE_URL`, `DEV_DATABASE_URL` and
   `DEV_SUPERADMIN_DATABASE_URL` secrets on `uvanoo-dev-private`.
7. Recheck the persisted fence and zero writers immediately before migration.
   The migration login is `beaconhs_migrator` in database `beaconhs`; migration
   code assumes the NOLOGIN role `beaconhs_owner`. Do not put migration
   credentials in Dokploy's long-running application environment.
8. After successful migration, save and deploy the candidate with replicas zero.
9. Verify all writer service specs reference the exact candidate image and SHA,
   still with no active writers. Persist replicas one, read back, and deploy.
10. Verify one running, healthy web and worker task with the candidate identity;
    require a new scheduler task to complete with exit zero. Then require the
    existing external exact-SHA readiness and login-page checks.

Web and worker write application data. Scheduler registers repeatable jobs in
Redis and exits; it is fenced as a producer so deployment cannot reactivate an
old scheduler during migration. Collabora is not a database writer.

## Failure and recovery

Only the isolated DEV Compose ID `wYb0LxLQrvj2FPI21i-Oj`, stack
`uvanoo-v1-4-dev-gniriv`, domain `dev.uvanoo.com`, raw Stack source and disabled
automatic deployment are accepted by the fence helper. Direct Swarm fallback
is forbidden. Normal-main deployment behavior is unchanged.

Missing/ambiguous state, failed API calls, inconsistent saved values, inability
to apply the fence, or remaining tasks block migration. Polling is bounded.
Secrets and raw process/API errors are never logged by the helper. Temporary
Compose rendering files use a private directory and mode 0600 and are removed.

Migration or candidate-rollout failure leaves the persisted fence at zero.
There is no unconditional restore, rollback migration or automatic old-image
revival. The failure summary reports step outcomes. Inspect the migration state
and authorize recovery before starting writers. If restore itself started but
failed, replicas may already be one; inspect both Dokploy and Swarm before any
recovery action. Job cancellation or host loss requires the same inspection.

The workflow concurrency group serializes governed deployments. Concurrent
manual edits remain an operator action: saved-state drift aborts verification;
operators must not alter the Compose or writers during migration.

Validation uses mocked control-plane/runtime observations and an executable
workflow-shell failure test. It does not run migrations or deploy to DEV.
