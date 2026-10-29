# DEV Collabora and WOPI observer — 29 October 2026

This is DEV-only operational telemetry, covering every current and future DEV tenant.
It does not grant document access, modify tenant records, or change normal user RLS.

## Permission model and credential custody

Collabora CODE 26.04.2.1-1 exposes authenticated metrics through
`/cool/getMetrics`. The installed image is pinned to
`sha256:df33af88c59e26b7335ea98d91e65f1edf13f33369ce6115941b8d59d3409cb5`.
Its supported admin-console credential is privileged; it is **not** a native
read-only administrative role. The supported alternative is a dedicated DEV
administrator identity with a collector restricted to GET metrics. Compromise of
that credential can permit broader Collabora administration. No production
credential or interactive Super Admin session is reused.

The owner approved this alternative and an immediate controlled DEV interruption.
The supported `coolconfig set-admin-password` tool received the password only
through stdin and generated a salted hash. The hash configuration is mounted
read-only from a content-addressed file beneath the private monitoring directory.
This uses the existing governed sidecar mount preservation mechanism.
The initial Docker secret was removed after final mount verification. Never emit the private XML or JSON contents.

Private collector configuration:
`/opt/uvanoo-dev/monitor-private/collabora-observer.json`, root-owned mode 0600.
The existing monitoring service account is root; no other host account is granted
plaintext access. The XML is root-owned, group 1001, mode 0440, behind the private
directory, and exposed read-only to the Collabora service UID/GID 1001.

The WOPI credential is a distinct random bearer token. Only its SHA-256 digest and
expiry are supplied to the DEV web process. Revocation clears/rotates the digest;
rotation must update the private collector token, persist the corresponding saved
DEV settings, and roll out through the governed process. Initial lifetime is seven
days. Expired or missing configuration denies access. There is no cookie fallback.

## Collection and privacy

Run `python3 -B scripts/cluster/dev-recovery/collect_collabora_observer.py` under
the authorized monitoring account. It discovers all desired DEV Collabora and web
tasks, rejects missing/remote/duplicate tasks, requests namespace-local
authenticated metrics and WOPI GET telemetry, and rechecks task identity.
Credentials are passed via stdin, not argv. Child processes have a minimal
environment. Output contains only aggregate counts and a ledger watermark.

WOPI summaries cover the global DEV save ledger in a read-only transaction.
Global counts are compared across web producers, never summed across replicas.
Missing counters, authentication failure, stale or future observations, wrong
source/epoch, divergent ledgers, incomplete task coverage or timeouts produce
UNKNOWN with a nonzero exit. No document lists, user identities, contents or
subprocess diagnostics are emitted.

The collector is operational evidence, **not** a signed admission receipt.
It always reports `drainageProven: false` and historical save state UNKNOWN.
Neither zero current sessions nor a successful restart proves historical saves,
a no-writer interval, or safe release admission. Existing independent monitor
contracts, exact-source evidence and owner approval requirements remain intact.

## Maintenance evidence and watchdog review

The DEV-only proxy rule blocks new `/cool/`, `/browser/`, and `/hosting/`
requests. Existing WebSocket connections had 263 seconds to save/disconnect before
the first restart; WOPI save routes were left available. New editor requests
returned 403 while login returned 200. Historical unsaved changes cannot be ruled
out because pre-interruption telemetry was absent. Documents/storage were not
modified by this procedure. The proxy block remains until the reviewed reopening.

Authenticated metrics returned HTTP 200 with zero active views and assigned
documents; unauthenticated metrics returned 401. Initial warm-up requests timed
out and were not treated as successful observations.

The watchdog expects web/worker/scheduler/storage-init at zero replicas and zero
tasks. Its STOPPED latch reports `replicas-web` while DEV web is running.
This is a mismatch between the recovery-window policy and current operating state,
not proof of application failure. The latch has not been cleared and the watchdog
has not been disabled. Independent recovery review must establish the intended
window, verify the actual fenced state and all other required evidence, and
explicitly re-arm; this implementation does not provide an automatic reset.

## Governed release preparation

The DEV foundation template accepts the observer digest, expiry, epoch, compose
binding and exact source SHA. The sidecar preservation helper validates the
non-secret saved settings, rejects expiry/duplicates/wrong DEV scope, and replaces
the source binding with the new full APP_VERSION commit. It retains the exact
Collabora mounts and still rejects an active sidecar during candidate admission.
The legacy compose template and production services are unchanged.

Before dispatching a release:

1. Persist the new read-only Collabora XML mount in the exact DEV saved compose.
   Preserve all other sidecar settings and verify rendered equality with its
   approved fenced service specification.
2. Merge private `wopi-observer-release.env` settings into that same DEV saved
   environment. Never add the plaintext bearer token to the web environment.
3. Validate the exact candidate through Fast DEV and authoritative Full Release,
   publish an immutable image, and prepare fresh source-bound backup/restore,
   manifest and approval evidence using the established release procedure.
4. After the governed rollout, bind private collector `wopi.sourceSha` to the
   deployed full SHA; verify its epoch, all producers and actual save lifecycle
   observations. Never inject synthetic events into live audit or tenant tables.
5. Complete independent watchdog and admission review before re-arming.
   Remove the DEV editor block only during reviewed reopening.

The observer code does not dispatch deployments, migrate, clear latches, relax
freshness limits, or manufacture drainage proof.

## Validation

Focused Vitest tests cover token expiry/revocation, wrong deployment, invalid
credentials, rejection of interactive cookies, route denial and save-state
summaries. Python tests include real loopback HTTP exchange, authentication denial,
private-file checks, replica/ledger disagreement and task churn. Sidecar tests use
the actual Docker Compose renderer and verify observer binding preservation.
The deployment contract runs the Python observer suite in CI.

## Upstream references

- [Collabora SDK manual](https://sdk.collaboraonline.com/CO-SDK-manual.pdf)
- [26.04 admin protocol implementation](https://github.com/CollaboraOnline/online.mirror/blob/distro/collabora/co-26.04/wsd/Admin.cpp)
- [26.04 aggregate metrics](https://github.com/CollaboraOnline/online.mirror/blob/distro/collabora/co-26.04/wsd/metrics.txt)
- [26.04 supported configuration tool](https://github.com/CollaboraOnline/online.mirror/blob/distro/collabora/co-26.04/tools/Config.cpp)

## Current external prerequisite

Dokploy is reachable on its published API port, but the approved private token
returns HTTP 401. A valid authorized replacement is required before persisting
the observer settings or continuing the governed rollout. No credential recovery
from unrelated environments or authentication bypass is permitted.
