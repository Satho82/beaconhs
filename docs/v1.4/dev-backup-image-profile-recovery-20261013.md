# DEV PostgreSQL backup client profile correction

Corrected executable source: 58975d91639e085f9d8057c7b363f36f2fdd9d71.
Base: d26399d028789240ade0ee30b3b64600e6188e9a.

## Root cause

Read-only live inspection confirmed the permanent server and old client profile have different
image identities. Running the old checked_container check returned PINNED_PG_IMAGE_REQUIRED.
backup_controller invokes the bridge via pg_dump --version; dev_recovery.run suppresses child
stderr and reports TOOL_EXIT_FAILED. This occurs before the controller creates its fence journal.

Disposable run 38398096019 reproduced the old generic error and verified that the direct
preflight now reports the specific image rejection. The protected live attempt directory
capture.hF2QCW5c was unreadable through Commander, so its exact failed phase and service
mutation status still require the private inspection below. The generic error alone is
not sufficient to declare that attempt safely closed.

## Smallest validated correction

The client profile is now independently pinned:
postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94

The independent restore image remains unchanged:
postgres@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d

The client digest was recovered from the existing server and independently pulled into
GitHub-hosted disposable infrastructure, with exact PostgreSQL 16.15 client verification.
Docker image inspection resolves the immutable digest to its platform image ID before
comparison. There is no mutable tag, alternate-image fallback or version-only allowlist.

Clients still use the existing local Unix socket through docker exec in the verified server
container. No separate client container, network, socket relay, pg_hba change, password or new
database grant is introduced. No running image replacement is required.

Named isolated restore containers continue to select the unchanged restore pin; DEV selects the independently pinned client profile. There is no arbitrary profile environment override.

The direct verify_pg_client check now preserves the specific image rejection before subprocess
wrapping. Exact client version 16.15, backup role, no published ports, read-only session options,
and all existing fence/restore protections remain enforced.

The isolated restore readiness check additionally waits for the final PostgreSQL PID 1,
so the temporary initdb server cannot satisfy readiness. Version checking and all restore
security checks remain in place.

A read-only invocation of the new image check against DEV passed (Docker inspection only).
No client execution, dump, capture retry or live service change was performed by that check.

Code Git tree: 4a0582c1596e6cea3e284283c7e9731503735d93

## Retained and rejected evidence

Original passing runs remain: 38393904205, 38392830607, 38391683329.
Diagnostic regression and unchanged full controller: 38398152466 PASS.

The separate-client socket transport experiment failed disposable validation and was removed.
Do not use commits e1ceb5dbb742e0b3757e2b2cd2684a5bb9d5aeaf,
dae2de7330e980def3d558327b5acce8d2bd6287 or
29aabd36111d8b039767672019c904724a1208cd.
Failed runs 38397169680, 38397446372 and 38397645499 are preserved, not relabelled successful.

## Failed-attempt recovery

No live backup retry, service scaling, image replacement, SQL correction, migration,
deployment, merge or pinned-toolset edit occurred during this task.
Keep both previous capture directories, all locks, logs, archives and original volumes.

In the owner's authorised sudo SSH session, this command reads only the named attempt,
takes a nonblocking advisory lock if one exists, and prints filenames/phase indicators only:

```bash
sudo python3 - <<'PY'
import os, json, fcntl
from pathlib import Path
p = Path('/opt/uvanoo-dev/backups/recovery/capture.hF2QCW5c')
if not p.is_dir() or p.is_symlink():
    raise SystemExit('STOP: verify the exact failed attempt path')
fd = None
if (p/'operation.lock').exists():
    fd = os.open(p/'operation.lock', os.O_RDWR | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('STOP: capture still active')
names = sorted(x.name for x in p.iterdir())
events = sorted(x.name for x in (p/'journal').glob('*.private.json'))
print(json.dumps({
    'attempt': p.name,
    'preflightState': 'preflight-state.private.json' in names,
    'fenceState': 'fence-state.private.json' in names,
    'journalFiles': events,
    'acceptedCapture': 'capture-valid.private.json' in names,
    'safeClosure': 'safe-closure.private.json' in names
}))
if fd is not None:
    os.close(fd)
PY
```

If no preflight state, fence state or journal exists, this controller had not reached
service mutation. Confirm current service specifications against the recorded originals;
do not issue restoration/scaling commands merely because capture failed.

If any mutation journal exists, or the process is active, stop. Review its private receipts
and actual service versions before separately authorising restoration. Never infer ownership
from a replica-intent alone. Completed scheduler/storage-init jobs must remain untouched.


## Next safe capture procedure

First complete the read-only failed-attempt review above. If any mutation journal exists,
stop for exact service-version review; do not blindly run recovery or scale any service.
A preflight failure before any journal requires no automatic service restoration.

Use the existing SSH runbook from checkpoint 3d056b8bbb63d2b3cc9a37140bf52b94b87063b1,
substituting the corrected executable SHA above. Fetch it into a NEW tool directory and
create a NEW root-owned 0700 capture directory. Never resume a failed capture directory
or edit the previous pinned checkout in place.

In the authorised root SSH shell, the exact source retrieval is:

```bash
set -euo pipefail
umask 077
test "$(id -u)" = 0
TOOL_SHA=58975d91639e085f9d8057c7b363f36f2fdd9d71
TOOLSET="$(mktemp -d /opt/uvanoo-dev/backups/recovery/tools.XXXXXXXX)"
git -C "$TOOLSET" init --quiet
git -C "$TOOLSET" remote add origin https://github.com/Satho82/beaconhs.git
git -C "$TOOLSET" fetch --quiet --depth=1 origin "$TOOL_SHA"
git -C "$TOOLSET" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$TOOLSET" rev-parse HEAD)" = "$TOOL_SHA"
ADAPTER="$TOOLSET/scripts/cluster/dev-recovery"
```

After preparing the fresh RECOVERY_WORK and verified, unexpired window receipt using the
existing runbook, the capture command is:

```bash
python3 "$ADAPTER/backup_controller.py" capture \
  "$RECOVERY_WORK" "$RECOVERY_WORK/window.private.json" \
  > "$RECOVERY_WORK/capture-result.private.json"
```

Do not run it until the previous attempt is understood and exclusive recovery window,
Collabora drainage, external-writer exclusion, protected capacity/destinations and safe
restoration are established. Existing age key custody is retained; no new key check is requested.
This command was not executed in this correction task.

The old runbook's client-image statement is superseded by the independent client and restore
pins above. No actual backup checksum, off-VPS backup custody or real-data rehearsal is claimed.

## Final validation

PASS: https://github.com/Satho82/beaconhs/actions/runs/38399343438
at executable source 58975d91639e085f9d8057c7b363f36f2fdd9d71.

- 38 unit contracts, including both profile selections and diagnostic/version rejection.
- Independently pulled PostgreSQL 16.15 client profile.
- Encrypted synthetic capture and independent restore: 21 documents, 19 matching schema/security sections, ledger, data/sequence equality, tenant isolation and append-only trigger.
- Full controller: five recovery components, Swarm fencing, continuous monitoring, exact service restoration, and restored 58-entry synthetic ledger/schema/data equality.
- Accepted runtime, migration SQL and deployment contracts unchanged.
- No private files tracked.

Intermediate failing runs 38398398345, 38398672302 and 38399043420 remain preserved. Their partial successes are not represented as overall green runs. The final result above includes the corrected restore readiness and isolated-profile selection.

These are disposable fixtures, not an actual DEV backup, canonical58 reconstruction, real-data migration rehearsal or off-VPS custody proof. Live operational prerequisites remain required.
