"""New admission regressions only. Synthetic files/mocks; no Docker or network."""
import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
import recovery_admission as a
import recovery_components as c
import backup_controller as controller
import backup_fence as f
import dev_recovery as r
import storage_reconcile as storage


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.now = dt.datetime.now(dt.timezone.utc)
        self.receipt = dict(recipientSha256=controller.RECIPIENT,
            retrievalHostSha256='b'*64, vaultVersionId='synthetic-vault-version',
            verifiedAt=self.now.isoformat(), challengeDecryptPassed=True,
            attestedBy='synthetic-custodian')
        self.put('key-custody.private.json', self.receipt)
        self.value = dict(sourceHostSha256='a'*64, restoreHostSha256='b'*64,
            destinationId='synthetic-private-bucket', recipientSha256=controller.RECIPIENT,
            keyReceiptSha256=r.sha(self.work/'key-custody.private.json'),
            externalGuardSha256='d'*64,
            expiresAt=(self.now+dt.timedelta(hours=1)).isoformat(),
            privateRestoreHost=True, immutableRetention=True, separateDeleteAuthority=True)
        self.approve()

    def put(self, name, value):
        p = self.work/name
        p.write_bytes(r.canonical(value))
        p.chmod(0o600)

    def approve(self):
        self.put(a.POLICY, self.value)
        self.digest = r.sha(self.work/a.POLICY)

    def test_valid_policy_and_key_receipt(self):
        self.assertEqual(a.policy(self.work, self.digest), self.value)
        self.assertEqual(a.key_custody(self.work, self.value), self.receipt)

    def test_unapproved_policy_rejected(self):
        with self.assertRaisesRegex(r.Rejected, 'OWNER_APPROVED_POLICY_REQUIRED'):
            a.policy(self.work, '0'*64)

    def test_policy_rejects_missing_isolation_and_retention(self):
        for key in ('privateRestoreHost', 'immutableRetention', 'separateDeleteAuthority'):
            with self.subTest(key=key):
                self.value[key] = False
                self.approve()
                with self.assertRaises(r.Rejected): a.policy(self.work, self.digest)
                self.value[key] = True

    def test_same_host_rejected(self):
        self.value['restoreHostSha256'] = self.value['sourceHostSha256']
        self.approve()
        with self.assertRaisesRegex(r.Rejected, 'INDEPENDENT_RESTORE_HOST_REQUIRED'):
            a.policy(self.work, self.digest)

    def test_expired_policy_capture_rejected_historical_restore_allowed(self):
        self.value['expiresAt'] = (self.now-dt.timedelta(days=30)).isoformat()
        self.approve()
        with self.assertRaisesRegex(r.Rejected, 'EXECUTION_POLICY_EXPIRED'):
            a.policy(self.work, self.digest)
        self.assertEqual(a.policy(self.work, self.digest, fresh=False), self.value)

    def test_key_receipt_tampering_rejected(self):
        self.receipt['challengeDecryptPassed'] = False
        self.put('key-custody.private.json', self.receipt)
        with self.assertRaisesRegex(r.Rejected, 'KEY_RECEIPT_IDENTITY_REJECTED'):
            a.key_custody(self.work, self.value)
        self.value['keyReceiptSha256'] = r.sha(self.work/'key-custody.private.json')
        with self.assertRaisesRegex(r.Rejected, 'INDEPENDENT_KEY_CUSTODY_REQUIRED'):
            a.key_custody(self.work, self.value)

    def test_stale_key_proof_requires_retrieval_for_new_capture(self):
        self.receipt['verifiedAt'] = (self.now-dt.timedelta(days=2)).isoformat()
        self.put('key-custody.private.json', self.receipt)
        self.value['keyReceiptSha256'] = r.sha(self.work/'key-custody.private.json')
        with self.assertRaises(r.Rejected): a.key_custody(self.work, self.value)
        a.key_custody(self.work, self.value, fresh=False)

    def services(self):
        return {x: {'Spec': {'Name': f.STACK+'_'+x,
            'Labels': {'com.docker.stack.namespace': f.STACK},
            'Mode': {'Replicated': {'Replicas': 0}}}} for x in f.REPEATING+f.ONESHOT}

    def test_all_five_controls_required_zero(self):
        for role in f.REPEATING+f.ONESHOT:
            services = self.services()
            services[role]['Spec']['Mode']['Replicated']['Replicas'] = 1
            api = Mock(services=Mock(return_value=services))
            with self.subTest(role=role), self.assertRaisesRegex(r.Rejected, 'ALL_FIVE'):
                a.zero(api)
            api.set_replicas.assert_not_called()

    def test_actual_running_shutdown_desired_task_rejected(self):
        api = Mock(services=Mock(return_value=self.services()), tasks=Mock(return_value=[
            {'DesiredState': 'shutdown', 'Status': {'State': 'running'}}]))
        with self.assertRaisesRegex(r.Rejected, 'WRITER_TASKS_NOT_DRAINED'): a.zero(api)

    def test_zero_observation_never_mutates(self):
        api = Mock(services=Mock(return_value=self.services()), tasks=Mock(return_value=[]))
        a.zero(api)
        api.set_replicas.assert_not_called()

    def heartbeat(self):
        return dict(pid=987654, startTicks='123', policySha256=self.digest,
            externalGuardSha256=self.value['externalGuardSha256'],
            verifiedAt=self.now.isoformat())

    def test_watchdog_binding_and_staleness(self):
        with patch.object(a, 'service_pid', return_value=987654), \
             patch.object(a, 'process_identity', return_value='123'):
            self.put(a.HEARTBEAT, self.heartbeat())
            a.watchdog(self.work, self.value)
            for field, value in [('pid', 77), ('startTicks', 'reused'),
                    ('policySha256', '0'*64), ('externalGuardSha256', '0'*64),
                    ('verifiedAt', (self.now-dt.timedelta(seconds=11)).isoformat()),
                    ('verifiedAt', (self.now+dt.timedelta(seconds=30)).isoformat())]:
                beat = self.heartbeat(); beat[field] = value
                self.put(a.HEARTBEAT, beat)
                with self.subTest(field=field), self.assertRaises(r.Rejected):
                    a.watchdog(self.work, self.value)

    def test_invalidation_latches(self):
        self.put(a.INVALID, {'status': 'INVALID'})
        with self.assertRaisesRegex(r.Rejected, 'CAPTURE_INVALIDATED'):
            a.watchdog(self.work, self.value)

    def test_capture_denial_precedes_any_setup_or_mutation(self):
        with patch.object(os, 'geteuid', return_value=0), \
             patch.object(a, 'admission', side_effect=r.Rejected('NO_PROOF')), \
             patch.object(controller, 'client_setup') as setup:
            with self.assertRaisesRegex(r.Rejected, 'NO_PROOF'):
                controller.capture(self.work, self.work/'window')
            setup.assert_not_called()
            self.assertFalse((self.work/'operation.lock').exists())

    def test_no_automatic_recovery(self):
        with self.assertRaisesRegex(r.Rejected, 'NO_AUTOMATIC_RECOVERY'):
            controller.recover(self.work, 'unused')

    def test_custody_bound_to_manifest_destination_and_host(self):
        manifest = {'createdAt': (self.now-dt.timedelta(minutes=1)).isoformat(),
            'context': {'offHostReceiptSha256': self.digest,
                        'custodyReceiptSha256': self.value['keyReceiptSha256'],
                        'recipientSha256': self.value['recipientSha256']}}
        receipt = dict(manifestSha256='e'*64, location=self.value['destinationId'],
            hostSha256='b'*64, verifiedAt=self.now.isoformat(), allChecksumsMatch=True,
            independentHost=True, attestedBy='synthetic-verifier')
        with patch.object(r, 'verify', return_value=manifest), \
             patch.dict(os.environ, {'UVANOO_RECOVERY_POLICY_SHA256': self.digest}):
            c.check_custody(self.work, 'e'*64, receipt)
            for key, wrong in [('location', 'owner-independent-Mac'), ('hostSha256', 'a'*64),
                               ('manifestSha256', 'f'*64), ('allChecksumsMatch', False)]:
                bad = dict(receipt); bad[key] = wrong
                with self.subTest(key=key), self.assertRaises(r.Rejected):
                    c.check_custody(self.work, 'e'*64, bad)

    def test_offhost_restore_does_not_initialize_live_client(self):
        self.put('off-vps-custody.private.json', {})
        self.put('safe-closure.private.json', {'captureAccepted': True})
        argv = ['backup_controller.py', 'restore', str(self.work), 'e'*64,
                '/private/identity', '/private/new-restore-parent', '/private/roles.sql', 'f'*64]
        with patch('sys.argv', argv), patch.object(c, 'check_custody'), \
             patch.object(a, 'policy', return_value=self.value), \
             patch.object(a, 'host_identity', return_value='b'*64), \
             patch.object(a, 'key_custody'), patch.object(r, 'run', return_value=b'pg_restore (PostgreSQL) 16.15'), \
             patch.object(controller, 'client_setup') as live, \
             patch.object(controller.restore_disposable, 'restore', return_value={}) as restore, \
             patch('builtins.print'):
            controller.main()
            live.assert_not_called()
            restore.assert_called_once()

    def test_watchdog_guard_failure_latches_without_live_mutation(self):
        with patch.object(a, 'policy', return_value=self.value), \
             patch.object(a, 'host_identity', return_value='a'*64), \
             patch.object(a, 'process_identity', return_value='123'), \
             patch.object(a, 'zero', return_value=self.services()), \
             patch.object(r, 'guard', side_effect=r.Rejected('EXTERNAL_WRITER')):
            with self.assertRaisesRegex(r.Rejected, 'EXTERNAL_WRITER'): a.supervise(self.work)
        self.assertEqual(a.read(self.work/a.INVALID)['status'], 'INVALID')
        self.assertFalse((self.work/a.HEARTBEAT).exists())

    def test_storage_comparison_never_reports_names(self):
        row = dict(bucket='private-bucket', key='private-object', version='null',
                   bytes=123, sha256='a'*64)
        value = dict(expected=[row], actual=[row], scopeReceiptSha256='b'*64,
                     allPagesCollected=True, bucketMetadataVerified=True)
        self.assertEqual(storage.compare(value)['inventoryComparison'], 'PASS')
        value['actual'] = []
        result = storage.compare(value)
        self.assertEqual(result['missingObjects'], 1)
        self.assertNotIn('private-object', json.dumps(result))
        value['actual'] = [dict(row, sha256='c'*64)]
        self.assertEqual(storage.compare(value)['mismatchedObjects'], 1)
        value['expected'] = []
        self.assertEqual(storage.compare(value)['unexplainedObjects'], 1)

    def test_incomplete_and_duplicate_storage_inventories_rejected(self):
        row = dict(bucket='private', key='private', version='null', bytes=0, sha256='a'*64)
        value = dict(expected=[row], actual=[row], scopeReceiptSha256='b'*64,
                     allPagesCollected=False, bucketMetadataVerified=True)
        with self.assertRaises(r.Rejected): storage.compare(value)
        value['allPagesCollected'] = True
        value['actual'].append(row)
        with self.assertRaisesRegex(r.Rejected, 'DUPLICATE'): storage.compare(value)


if __name__ == '__main__':
    unittest.main()
