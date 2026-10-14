"""Owner-bound recovery policy and independent, non-mutating fence watchdog.

Receipts are attestations, not proof that a vault/provider told the truth. The
owner must review their underlying evidence before approving the policy digest.
No default destination, key-custody assertion, or external-writer probe exists.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import time
import dev_recovery as r
import backup_fence as f

UNIT = "uvanoo-dev-recovery-watchdog.service"
POLICY = "execution-policy.private.json"
HEARTBEAT = "watchdog-heartbeat.private.json"
INVALID = "capture-invalid.private.json"


def read(path):
    return json.loads(r.private(path).read_text())


def host_identity():
    return hashlib.sha256(Path('/etc/machine-id').read_bytes().strip()).hexdigest()


def recent(value, seconds, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    return stamp.tzinfo is not None and 0 <= (now-stamp).total_seconds() <= seconds


def policy(work, expected=None, fresh=True):
    path = r.private(Path(work)/POLICY)
    expected = expected or os.environ.get('UVANOO_RECOVERY_POLICY_SHA256', '')
    r.require(r.HEX.fullmatch(expected) and r.sha(path) == expected,
              'OWNER_APPROVED_POLICY_REQUIRED')
    value = read(path)
    r.require(set(value) == {'sourceHostSha256', 'restoreHostSha256', 'destinationId',
        'recipientSha256', 'keyReceiptSha256', 'externalGuardSha256',
        'expiresAt', 'privateRestoreHost', 'immutableRetention', 'separateDeleteAuthority'},
        'EXECUTION_POLICY_FIELDS_REJECTED')
    for name in ('sourceHostSha256', 'restoreHostSha256', 'recipientSha256',
                 'keyReceiptSha256', 'externalGuardSha256'):
        r.require(isinstance(value[name], str) and r.HEX.fullmatch(value[name]),
                  'EXECUTION_POLICY_DIGEST_REJECTED')
    r.require(value['sourceHostSha256'] != value['restoreHostSha256'],
              'INDEPENDENT_RESTORE_HOST_REQUIRED')
    r.require(isinstance(value['destinationId'], str) and
              r.NAME.fullmatch(value['destinationId']), 'DESTINATION_ID_REQUIRED')
    r.require(all(value[x] is True for x in ('privateRestoreHost', 'immutableRetention',
                                           'separateDeleteAuthority')),
              'DESTINATION_POLICY_NOT_APPROVED')
    expiry = dt.datetime.fromisoformat(value['expiresAt'].replace('Z', '+00:00'))
    now = dt.datetime.now(dt.timezone.utc)
    r.require(expiry.tzinfo is not None, 'EXECUTION_POLICY_TIMEZONE_REQUIRED')
    r.require(not fresh or dt.timedelta(0) < expiry-now <= dt.timedelta(hours=2),
              'EXECUTION_POLICY_EXPIRED')
    return value


def key_custody(work, value, fresh=True):
    path = r.private(Path(work)/'key-custody.private.json')
    r.require(r.sha(path) == value['keyReceiptSha256'], 'KEY_RECEIPT_IDENTITY_REJECTED')
    receipt = read(path)
    r.require(set(receipt) == {'recipientSha256', 'retrievalHostSha256',
        'vaultVersionId', 'verifiedAt', 'challengeDecryptPassed', 'attestedBy'},
        'KEY_RECEIPT_FIELDS_REJECTED')
    r.require(receipt['recipientSha256'] == value['recipientSha256'] and
              receipt['retrievalHostSha256'] == value['restoreHostSha256'] and
              receipt['challengeDecryptPassed'] is True and
              all(isinstance(receipt[x], str) and receipt[x].strip()
                  for x in ('vaultVersionId', 'attestedBy')) and
              recent(receipt['verifiedAt'], 86400 if fresh else 10**12),
              'INDEPENDENT_KEY_CUSTODY_REQUIRED')
    return receipt


def zero(api):
    services = api.services()
    selected = f.select(services)
    r.require(all(services[sid]['Spec']['Mode']['Replicated']['Replicas'] == 0
                  for sid in selected.values()), 'ALL_FIVE_PERSISTENT_ZERO_REQUIRED')
    f.no_tasks(api, selected.values())
    return services


def service_pid():
    properties = r.run(['systemctl', 'show', UNIT, '--property=ActiveState',
                        '--property=MainPID']).decode().splitlines()
    value = dict(line.split('=', 1) for line in properties)
    r.require(value.get('ActiveState') == 'active', 'INDEPENDENT_WATCHDOG_NOT_ACTIVE')
    pid = int(value.get('MainPID', '0'))
    r.require(pid > 1, 'INDEPENDENT_WATCHDOG_PID_REJECTED')
    return pid


def process_identity(pid):
    # Linux starttime detects PID reuse; split after comm, which may contain spaces.
    start = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]
    cgroup = Path(f'/proc/{pid}/cgroup').read_text()
    r.require(any(line.endswith('/system.slice/'+UNIT) for line in cgroup.splitlines()),
              'INDEPENDENT_SYSTEM_SERVICE_REQUIRED')
    return start


def watchdog(work, value=None):
    work = Path(work)
    value = value or policy(work)
    r.require(not (work/INVALID).exists(), 'CAPTURE_INVALIDATED')
    beat = read(work/HEARTBEAT)
    pid = service_pid()
    r.require(pid != os.getpid() and beat.get('pid') == pid and
              beat.get('startTicks') == process_identity(pid) and
              beat.get('policySha256') == r.sha(work/POLICY) and
              beat.get('externalGuardSha256') == value['externalGuardSha256'] and
              recent(beat.get('verifiedAt', ''), 10), 'WATCHDOG_STALE_OR_UNBOUND')


def admission(work):
    value = policy(work)
    r.require(host_identity() == value['sourceHostSha256'], 'SOURCE_HOST_REJECTED')
    key_custody(work, value)
    watchdog(work, value)
    zero(f.Docker())
    return value


def supervise(work):
    """Run ONLY as the separately approved system service, never a child thread.

    Persisted all-zero controls are the safety mechanism on controller loss.
    This monitor invalidates capture on drift; it never silently updates Docker
    or overwrites another operator. External admission remains owner-controlled.
    """
    work = r.private(work, True)
    value = policy(work)
    policy_hash = r.sha(work/POLICY)
    r.require(host_identity() == value['sourceHostSha256'], 'SOURCE_HOST_REJECTED')
    start = process_identity(os.getpid())
    baseline = zero(f.Docker())
    try:
        while True:
            policy(work, policy_hash)
            r.require(not (work/INVALID).exists(), 'CAPTURE_INVALIDATED')
            r.require(zero(f.Docker()) == baseline, 'WATCHDOG_SERVICE_DRIFT')
            # Must inspect saved Dokploy controls, external writers, drainage,
            # admission lock and its expiry. No successful default is provided.
            r.guard(work/'external-writer-guard', value['externalGuardSha256'])
            if (work/'fence-state.private.json').exists():
                import backup_controller
                backup_controller.guard_state(work, check_watchdog=False)
            beat = dict(pid=os.getpid(), startTicks=start, policySha256=policy_hash,
                        externalGuardSha256=value['externalGuardSha256'],
                        verifiedAt=dt.datetime.now(dt.timezone.utc).isoformat())
            temporary = work/'watchdog-heartbeat.next.private.json'
            r.write_new(temporary, r.canonical(beat))
            os.replace(temporary, work/HEARTBEAT)
            time.sleep(2)
    except Exception:
        if not (work/INVALID).exists():
            r.write_new(work/INVALID, r.canonical({'status': 'INVALID',
                        'reason': 'INDEPENDENT_WATCHDOG_FAILED'}))
        raise


if __name__ == '__main__':
    import sys
    try:
        r.require(len(sys.argv) == 2, 'WORK_DIRECTORY_REQUIRED')
        supervise(sys.argv[1])
    except Exception:
        print('{"error":"INDEPENDENT_WATCHDOG_FAILED"}', file=sys.stderr)
        sys.exit(1)
