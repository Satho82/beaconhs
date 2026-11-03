# DEV deployment V2

Status: additive replacement under review; execution is fail-closed pending unresolved safety controls.
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
2. Once the safety controls below are resolved, owner dispatches **Uvanoo DEV deploy V2**, mode `fast`, exact SHA and digest,
   `execute=true`, and confirms backward-compatible application writes.
3. The runner checks actual live source, immutable image labels, the digest recorded by
   the exact successful authoritative CI publish job, target identities, the small
   migration ledger against deployed source, infrastructure health, background-job
   pause and configuration drift. Missing or ambiguous provenance fails closed.
4. A normal, dedicated tenant test account checks Current Handover, History and property
   scope. The rollout changes only web image and version, then repeats readiness and
   creates one clearly labelled Handover smoke record, verifying it in History.
5. Failure rolls back the image/configuration and verifies the previous version. A failed
   rollback is an explicit operator incident, never a successful deployment.

Expected duration: **5–15 minutes after image availability**, excluding CI, runner queues
and first-time dependency installation. This is a target, not a measured production SLA.
No full restore, database-wide reconciliation or repeated tenant scan is required in FAST.
Only explicit static image and documentation paths are eligible; all source changes,
unknown paths and sensitive/shared files route to CONTROLLED. A diff classifier cannot
prove semantic compatibility; the owner's compatibility assertion and CI are both required.
FAST activation is currently blocked in code: Dokploy does not expose an atomic conditional
environment update, and the single web replica lacks a verified document-save drain or
proven uninterrupted cutover. These controls and a real rollback rehearsal are required
before activation can be enabled.

## CONTROLLED DEV

Use the existing `deploy-v1.4-dev-candidate.yml` directly with the exact source and
existing approved evidence/policy pins. V2 controlled execution fails closed because
the GitHub dispatch API does not return the dispatched run ID and a competing same-SHA
run could otherwise be misidentified. The V2 controlled dry run remains available. Migration compatibility, encrypted backup,
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
  `DEV_SMOKE_FORBIDDEN_PROPERTY_ID` (unassigned property in the same test tenant),
  `DEV_SMOKE_CROSS_TENANT_PROPERTY_ID` (property in a second isolated test tenant),
  `DEV_SMOKE_FORBIDDEN_SENTINEL` and `DEV_SMOKE_CROSS_TENANT_SENTINEL` (unique labelled
  Handover records proving both forbidden-property checks), `DEV_SMOKE_SAME_TENANT_ID`,
  `DEV_SMOKE_CROSS_TENANT_ID`, and `DEV_SMOKE_BROWSER` (sandbox-capable Chromium path).
  Configure `DEV_SMOKE_AUDITOR_EMAIL` and `DEV_SMOKE_AUDITOR_PASSWORD` as secrets for a
  separate read-only fixture user scoped only to the two sentinel properties. The smoke
  searches by a unique marker suffix and requires the auditor to find the complete
  sentinel in the page while it is absent from the restricted user’s HTML, serialized
  data and DOM. Searching the suffix avoids pagination and query-reflection false passes.
  Before inspecting serialized data, the smoke normalizes common JSON/JavaScript
  escapes, HTML character references, URL encodings and split string fragments
  without executing the payload. A separate authenticated fetch streams decoded
  bytes and aborts above 2 MiB, including chunked or compressed responses; unresolved
  nested encodings at the bounded decode limit also fail closed. These checks complement, but do not replace,
  server-side authorization and tenant-isolation tests.
  The session verifier is a root-owned, source-hash-checked command with a root-owned
  pinned identity manifest; it returns only PASS/DENY for the two fixture accounts using
  the existing read-only backup DB role. It does not expose a database password to the
  runner. The current `ubuntu` runner nevertheless has pre-existing unrestricted sudo
  and Docker access, so it is not least-privileged. Activation requires an isolated
  dedicated runner or broker with a reviewed restricted privilege boundary.
- Set `DEV_FAST_V2_ENABLED=true` only after approval. Default is disabled. Only owner
  `Satho82` can dispatch; execution is restricted to the governed feature branch.
- Run `execute=false` first. This reads runtime/configuration and checks CI, image,
  health and classification, but performs no deployment, smoke writes or database scans.

The workflow uses the existing `deploy-dev` concurrency group. Local operators must use
its flock lock too. An independent Dokploy edit can race the GET/compare/save sequence;
the lock is not shared with Dokploy and cannot prevent lost updates. FAST therefore
remains disabled until atomic conditional persistence or a genuinely shared exclusion is
implemented and verified.
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
