# DEV deployment V2

Status: additive replacement under review; execution disabled until owner approval.
The live release, original release workflows, backups, recovery evidence and maintenance
watchdog remain unchanged. This document applies only to `dev.uvanoo.com` and
`uvanoo_dev`; it does not change production or legacy procedures.

## Audit and decisions

| Existing cost or failure                                                     | V2 decision                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routine image changes entered the database recovery path                     | Classify the actual deployed-source-to-candidate diff. FAST never runs migrations or restores.                                                                |
| Short-lived monitor observations invalidated otherwise unchanged backups     | FAST checks current readiness and exact deployment identity, without a maintenance no-writer interval. CONTROLLED retains existing admission.                 |
| Copied evidence directories referenced previous candidates                   | FAST derives identity from live Dokploy/runtime and requested immutable source; no copied evidence directory.                                                 |
| Repeated full tenant/storage scans for application-only changes              | Reuse exact-source authoritative CI; run targeted authenticated Handover/property smoke. Sensitive changes cannot select FAST.                                |
| Multiple owner pins during routine release                                   | One owner workflow dispatch identifies candidate/digest and confirms backward compatibility. No expiring FAST evidence pin.                                   |
| Main and DEV share a complex deployment implementation                       | FAST hard-codes DEV identities and changes only the DEV web service. Original main and legacy paths are unchanged.                                            |
| Watchdog expects all writers stopped while web activation needs them running | Maintenance watchdog stays outside normal application deployment. It is retained for controlled recovery.                                                     |
| Failed activation needed manual configuration reconstruction                 | Persist previous image/source, compare configuration before writing, restore image and configuration and verify rollback. Never roll back data automatically. |

## FAST DEV

1. Existing Full Release CI validates and publishes the exact immutable feature image.
2. Owner dispatches **Uvanoo DEV deploy V2**, mode `fast`, exact SHA and digest,
   `execute=true`, and confirms backward-compatible application writes.
3. The runner checks actual live source, immutable image labels, successful authoritative
   CI jobs, target identities, the small migration ledger against deployed source, infrastructure health, background-job pause and configuration drift.
4. A normal, dedicated tenant test account checks Current Handover, History and property
   scope. The rollout changes only web image and version, then repeats readiness and
   creates one clearly labelled Handover smoke record, verifying it in History.
5. Failure rolls back the image/configuration and verifies the previous version. A failed
   rollback is an explicit operator incident, never a successful deployment.

Expected duration: **5–15 minutes after image availability**, excluding CI, runner queues
and first-time dependency installation. This is a target, not a measured production SLA.
No full restore, database-wide reconciliation or repeated tenant scan is required in FAST.
Changes to database, tenant/auth code, permissions, storage, workers, WOPI, infrastructure,
dependencies or unknown/shared paths route to CONTROLLED. A diff classifier cannot prove
semantic compatibility; the owner's compatibility assertion and CI are both required.

## CONTROLLED DEV

Select `controlled` with the exact source and existing approved evidence/policy pins.
V2 dispatches and waits for the existing `deploy-v1.4-dev-candidate.yml`; it does not
claim success when dispatch merely succeeds. Migration compatibility, encrypted backup,
restore/rollback verification, scoped tenant/storage integrity and source-bound admission
remain enforced by that mechanism. Destructive changes require explicit separate approval.

This transition deliberately retains the proven, more conservative CONTROLLED path,
including its full restore requirements. Risk-specific relaxation of those checks needs
separate reviewed policy changes; FAST supplies the immediate reduction for routine work.
No destructive operation or schema downgrade is implemented by the FAST executor.

## Enablement after replacement approval

Do not enable or merge for activation merely because CI passes.

- Review this branch, regression/failure simulation results and non-deploying dry run.
- Merge the approved V2 workflow into `feature/uvanoo-v1.4`.
- On the existing authorized Dokploy runner, ensure Node/pnpm, Docker, GitHub CLI,
  a dedicated service-scoped DEV Dokploy token and a sandbox-capable Chromium binary are available.
  The runner must have access to the DEV-only lock file `/opt/uvanoo-dev/dev-v2-deploy.lock`.
  Store the service-scoped token at `/opt/uvanoo-dev/fast-v2-credentials/dokploy.token`
  with owner-only read access for the runner. Verify the token cannot access non-DEV
  services or the Dokploy Docker API, and rotate it before its expiry. Grant only
  the DEV environment and service; configuration persistence uses Dokploy
  `saveEnvironment` and does not require service-creation access. Never copy
  the root-owned maintenance token into the runner account.
- Set repository secrets `DEV_SMOKE_EMAIL`, `DEV_SMOKE_PASSWORD` for a dedicated active
  DEV tenant member with Handover permission, never a Platform Admin session.
- Set variables `DEV_SMOKE_PROPERTY_ID` (authorized fixture),
  `DEV_SMOKE_FORBIDDEN_PROPERTY_ID` (known property in another tenant), and
  `DEV_SMOKE_BROWSER` (sandbox-capable Chromium executable path).
- Set `DEV_FAST_V2_ENABLED=true` only after approval. Default is disabled. Only owner
  `Satho82` can dispatch; execution is restricted to the governed feature branch.
- Run `execute=false` first. This reads runtime/configuration and checks CI, image,
  health and classification, but performs no deployment, smoke writes or database scans.

The workflow uses the existing `deploy-dev` concurrency group. Local operators must use
its flock lock too and avoid simultaneous external Dokploy edits. Config comparison fails
closed on drift; this is operational coordination, not technical exclusion of root.
Registry login uses a temporary private directory removed on exit. No credentials are
included in journals. Existing backups and recovery evidence are never pruned.

## Rollback and incident handling

FAST automatically restores only the previous immutable web image, application version
and matching Dokploy environment. Previous image availability is checked before mutation.
It preserves secrets, routing, databases, storage and all background replica counts.
If readiness or authenticated smoke fails after rollback, retain the journal and inspect
DEV before retrying; never claim recovery without checks. A lost runner or hard kill may
leave a partial image/config update: inspect Dokploy and Swarm against the recorded
source/digest, restore the matching pair, then rerun readiness and smoke. No database
restore should be attempted for an application-only rollback without a separate reason.

Historical worker, scheduler and storage-init services stay paused until separately
reconciled. Collabora is not restarted by FAST. Handover smoke records are retained and
labelled; no operational follow-ups, notifications or deletions are requested.

## Validation checklist

- Classifier, protected identity checks, dry-run non-mutation and owner enablement.
- CI/image/preflight failure before mutation; drift rejection.
- Persist, rollout, readiness, post-deploy smoke and background-pause failures.
- Successful rollback and failed rollback reported distinctly.
- Existing readiness and legacy candidate contracts still pass.
- Original deployment/production workflows and watchdog unchanged from live baseline.
- Full cloud validation and immutable publication for this branch; no DEV deployment.

## Recorded implementation validation

The non-deploying VPS run against live `a8009246` passed exact image/source/CI,
canonical database identity, all 67 migration ledger hashes/timestamps, infrastructure
health, paused background services and public editor/readiness checks. No live service
or database configuration was modified. The initial health probe incorrectly rejected
Next.js streaming login redirects; the V2 adapter now recognizes only the exact
same-origin login markers, with negative regression tests. Original readiness code
and the old deployment paths remain intact.

The replacement has not been activated against live DEV. A dedicated DEV smoke
account, a sandboxed matching Chromium runner, and a service-scoped Dokploy token
have been configured. The token can read the DEV service but cannot read the
non-DEV service or Docker inventory. Authenticated Current/History Handover,
property isolation and a labelled fixture creation passed on the isolated smoke
tenant. The runner token must be rotated before its expiration. Simulated rollback
coverage is not a claim that a live rollback rehearsal occurred; enablement remains
blocked until rollout and rollback safeguards are reviewed and rehearsed.
