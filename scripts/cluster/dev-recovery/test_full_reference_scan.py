import contextlib
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import full_reference_scan as scan


class FullReferenceScanTest(unittest.TestCase):
    def setUp(self):
        self.sha = 'a' * 40
        self.key = 't/' + 'b' * 8 + '-' + 'b' * 4 + '-' + 'b' * 4 + '-' + 'b' * 4 + '-' + 'b' * 12 + '/document/file.pdf'
        self.scope = [['public', 'attachments'], ['public', 'empty']]
        self.rows = {('public', 'attachments'): [{'r2_key': self.key}], ('public', 'empty'): []}

    def execute(self, discover=None, rows=None, state=None):
        return scan.scan(self.scope, discover or (lambda: self.scope),
                         rows or (lambda schema, table: self.rows[(schema, table)]),
                         state or (lambda: {'counter': 1}), self.sha)

    def test_complete_table_scan_is_not_automatically_classified(self):
        result = self.execute()
        self.assertEqual(result['tables'], self.scope)
        self.assertEqual(result['references'], [{'table': ['public', 'attachments'], 'keys': [self.key]}])
        self.assertFalse(result['allReferencesCovered'])
        self.assertFalse(result['releaseAdmitted'])

    def test_missing_extra_and_duplicate_tables_rejected(self):
        for tables in [self.scope[:1], self.scope + [['public', 'new']], self.scope + [self.scope[0]]]:
            with self.subTest(tables=tables), self.assertRaises(ValueError):
                self.execute(discover=lambda: tables)

    def test_state_drift_during_scan_rejected(self):
        values = iter([{'counter': 1}, {'counter': 1}, {'counter': 2}])
        with self.assertRaises(ValueError):
            self.execute(state=lambda: next(values))

    def test_before_after_and_scanned_counts_must_all_match(self):
        counts = {('public', 'attachments'): 1, ('public', 'empty'): 0}
        result = scan.scan(self.scope, lambda: self.scope, lambda a, b: self.rows[(a, b)],
                           lambda: {'counter': 1}, self.sha, counts,
                           lambda a, b: counts[(a, b)])
        self.assertEqual(len(result['tables']), 2)
        calls = iter([1, 0, 1, 0, 2])
        with self.assertRaises(ValueError):
            scan.scan(self.scope, lambda: self.scope, lambda a, b: self.rows[(a, b)],
                      lambda: {'counter': 1}, self.sha, counts, lambda a, b: next(calls))
        with self.assertRaises(ValueError):
            scan.scan(self.scope, lambda: self.scope, lambda a, b: [],
                      lambda: {'counter': 1}, self.sha, counts, lambda a, b: counts[(a, b)])

    def test_timeouts_and_failed_row_fetch_are_not_coverage(self):
        def timeout(*args):
            raise TimeoutError('simulated table lock timeout')
        with self.assertRaises(TimeoutError):
            self.execute(rows=timeout)

    def test_unsafe_sql_identifier_and_oversized_or_unknown_keys_rejected(self):
        with self.assertRaises(ValueError):
            scan.table_statement('public', 'attachments;drop')
        for name in ['objectKey', 's3_key', 'attachmentStorageKey']:
            with self.subTest(field=name), self.assertRaises(ValueError):
                scan.extract_references({name: 'unrecognized-key'})
        with self.assertRaises(ValueError):
            scan.extract_references({'content': 'embedded ' + self.key})
        with self.assertRaises(ValueError):
            scan.extract_references({'content': self.key.replace('/', '%2F')})
        with self.assertRaises(ValueError):
            scan.extract_references({'content': 's3://bucket/private'})
        with self.assertRaises(ValueError):
            scan.extract_references({'objectKey': 1})
        with self.assertRaises(ValueError):
            scan.extract_references({'r2_key': ''})
        with self.assertRaises(ValueError):
            scan.extract_references({'content': 'x' * (scan.MAX_JSON_BYTES + 1)})

    def test_nested_and_duplicate_references_are_found_once(self):
        self.assertEqual(scan.extract_references({'metadata': {'nested': [self.key, {'r2Key': self.key}]}}),
                         {self.key})

    def test_classification_must_match_exact_scan_and_every_reference(self):
        result = self.execute()
        result['columnScopeSha256'] = 'd' * 64
        result['primaryKeyScopeSha256'] = 'e' * 64
        result['rowCountsSha256'] = 'f' * 64
        result['snapshotModel'] = 'GUARDED_MULTITRANSACTION_WITH_EXPLICIT_PRIVILEGED_OPERATOR_RISK'
        digest = hashlib.sha256(scan.observer.canonical(result)).hexdigest()
        review = {'sourceSha': self.sha, 'status': 'REVIEWED', 'reviewer': 'independent reviewer',
                  'scanSha256': digest, 'columnScopeSha256': 'd' * 64, 'primaryKeyScopeSha256': 'e' * 64, 'rowCountsSha256': 'f' * 64,
                  'sourceReferencePathsReviewed': True, 'unknownFormsResolved': True, 'classifications': [
                      {'table': ['public', 'attachments'],
                       'rowSha256': result['occurrences'][0]['rowSha256'],
                       'fieldPath': ['r2_key'],
                       'keySha256': hashlib.sha256(self.key.encode()).hexdigest(),
                       'category': 'attachment'}]}
        self.assertEqual(scan.validate_classifications(result, review)['unclassifiedAdditionalKeys'], 0)
        wrong_path = dict(review['classifications'][0], fieldPath=['other'])
        with self.assertRaises(ValueError):
            scan.validate_classifications(result, dict(review, classifications=[wrong_path]))
        for bad in [dict(review, classifications=[]), dict(review, scanSha256='0' * 64),
                    dict(review, classifications=review['classifications'] * 2),
                    dict(review, sourceSha='c' * 40)]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                scan.validate_classifications(result, bad)

    def test_tooling_commit_and_blob_identity_are_verified(self):
        files = ['full_reference_scan.py', 'collect_release_observations.py', 'capture_fence_guard.py']
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / 'scripts' / 'cluster' / 'dev-recovery'
            base.mkdir(parents=True)
            blobs = {name: ('committed:' + name).encode() for name in files}
            for name, content in blobs.items():
                (base / name).write_bytes(content)
            expected = {name: hashlib.sha256(value).hexdigest() for name, value in blobs.items()}
            def git(args, timeout):
                if args[-2:] == ['rev-parse', 'HEAD']:
                    return (self.sha + '\n').encode()
                return blobs[args[-1].rsplit('/', 1)[-1]]
            self.assertTrue(scan.verify_tooling(root, self.sha, expected, git))
            (base / files[0]).write_bytes(b'modified')
            with self.assertRaises(ValueError):
                scan.verify_tooling(root, self.sha, expected, git)
            (base / files[0]).write_bytes(blobs[files[0]])
            with self.assertRaises(ValueError):
                scan.verify_tooling(root, 'c' * 40, expected, git)

    def test_deleted_object_audit_reference_is_not_silently_ignored(self):
        scope = [['public', 'attachments'], ['public', 'audit_log']]
        rows = {('public', 'attachments'): [],
                ('public', 'audit_log'): [{'metadata': {'r2Key': self.key}, 'action': 'delete'}]}
        result = scan.scan(scope, lambda: scope, lambda a, b: rows[(a, b)],
                           lambda: {'counter': 1}, self.sha)
        self.assertEqual(result['references'], [{'table': ['public', 'audit_log'], 'keys': [self.key]}])
        self.assertFalse(result['allReferencesCovered'])

    def test_page_plan_includes_terminal_empty_page_and_binds_sql(self):
        scope = [['public', 'a'], ['public', 'b']]
        plan = scan.plan_page_hashes(scope, {('public', 'a'): ['id']},
                                     {('public', 'a'): 2000, ('public', 'b'): 4})
        self.assertEqual([x['offset'] for x in plan if x['table'] == ['public', 'a']], [0, 1000, 2000])
        self.assertEqual(plan[1]['sqlSha256'], hashlib.sha256(
            scan.table_statement('public', 'a', ['id'], 1000).encode()).hexdigest())
        with self.assertRaises(ValueError):
            scan.plan_page_hashes(scope, {}, {('public', 'a'): 1})
        with self.assertRaises(ValueError):
            scan.plan_page_hashes(scope, {}, {('public', 'a'): scan.MAX_ROWS + 1, ('public', 'b'): 1})

    def test_composite_primary_key_scope_rejects_nullable_or_missing_columns(self):
        data = {'tables': [['public', 'x']], 'columns': [['public', 'x', 'tenant_id', 'uuid', True],
                ['public', 'x', 'id', 'uuid', True]],
                'primaryKeys': [{'table': ['public', 'x'], 'columns': ['tenant_id', 'id']}]}
        self.assertTrue(scan.validate_primary_scope(data))
        self.assertIn('ORDER BY "tenant_id","id" LIMIT 1000 OFFSET 1000',
                      scan.table_statement('public', 'x', ['tenant_id', 'id'], 1000))
        data['columns'][1][4] = False
        with self.assertRaises(ValueError):
            scan.validate_primary_scope(data)
        data['columns'].pop()
        with self.assertRaises(KeyError):
            scan.validate_primary_scope(data)
        with self.assertRaises(ValueError):
            scan.table_statement('public', 'x', (), 1000)

    def test_pagination_scans_over_two_megabytes_with_composite_key(self):
        keys = ['tenant_id', 'id']
        statements = [scan.table_statement('public', 'large', keys, offset) for offset in (0, 1000)]
        config = {'sourceSha': self.sha, 'approvedReadOnlySqlSha256': [
            hashlib.sha256(sql.encode()).hexdigest() for sql in statements]}
        pages = [{'overflow': False, 'rows': [{'payload': 'x' * 1500}] * 1000},
                 {'overflow': False, 'rows': [{'payload': 'y' * 1500}] * 500}]
        @contextlib.contextmanager
        def unlocked():
            yield
        outputs = [json.dumps(page).encode() for page in pages]
        self.assertGreater(sum(len(x) for x in outputs), 2_000_000)
        with patch.object(scan.observer, 'postgres_observation_lock', unlocked), \
             patch.object(scan.observer, 'execute', side_effect=outputs):
            rows = list(scan.execute_table(config, 'public', 'large', keys, lambda: {'counter': 1}))
        self.assertEqual(len(rows), 1500)
        with patch.object(scan.observer, 'postgres_observation_lock', unlocked), \
             patch.object(scan.observer, 'execute', return_value=outputs[0]):
            with self.assertRaises(ValueError):
                list(scan.execute_table(dict(config, approvedReadOnlySqlSha256=config['approvedReadOnlySqlSha256'][:1]),
                                   'public', 'large', keys, lambda: {'counter': 1}))

    def test_scan_binding_rejects_wrong_oid_image_and_time(self):
        config = {'sourceSha': self.sha, 'databaseOid': 123, 'imageDigest': 'sha256:' + 'd' * 64}
        result = dict(config, startedAt='2026-11-03T10:01:00+00:00', finishedAt='2026-11-03T10:02:00+00:00')
        samples = [{'observedAt': '2026-11-03T10:00:00+00:00'}, {'observedAt': '2026-11-03T10:03:00+00:00'}]
        self.assertTrue(scan.validate_scan_binding(result, config, samples))
        for bad in [dict(result, databaseOid=999), dict(result, imageDigest='sha256:' + 'e' * 64),
                    dict(result, startedAt='2026-11-03T09:59:00+00:00'),
                    dict(result, finishedAt='2026-11-03T10:04:00+00:00')]:
            with self.assertRaises(ValueError):
                scan.validate_scan_binding(bad, config, samples)

    def test_manifest_image_and_database_must_match_scan_and_config(self):
        binding = {'sourceSha': self.sha, 'databaseOid': 123, 'imageDigest': 'sha256:' + 'd' * 64}
        self.assertTrue(scan.validate_manifest_binding(binding, dict(binding), dict(binding)))
        for mismatch in [dict(binding, imageDigest='sha256:' + 'e' * 64),
                         dict(binding, databaseOid=999), dict(binding, sourceSha='c' * 40)]:
            with self.assertRaises(ValueError):
                scan.validate_manifest_binding(binding, binding, mismatch)

    def test_every_scanned_key_must_have_object_head_and_latest_version(self):
        result = self.execute()
        key_hash = hashlib.sha256(self.key.encode()).hexdigest()
        objects = {self.key: 123}
        metadata = {self.key: {'size': 123, 'contentType': 'application/pdf'}}
        versions = [{'keySha256': key_hash, 'latest': True, 'kind': 'Version', 'size': 123}]
        self.assertTrue(scan.validate_object_coverage(result, objects, metadata, versions, set(), set()))
        for bad_objects, bad_meta, bad_versions, allowed in [
            ({}, {}, [], set()),
            (objects, {}, versions, set()),
            (objects, metadata, [], set()),
            (objects, metadata, [dict(versions[0], kind='DeleteMarker')], set()),
            (objects, metadata, [dict(versions[0], size=999)], set()),
        ]:
            with self.subTest(objects=bad_objects, metadata=bad_meta), self.assertRaises(ValueError):
                scan.validate_object_coverage(result, bad_objects, bad_meta, bad_versions, allowed, set())
        self.assertTrue(scan.validate_object_coverage(result, {}, {}, [], {(('public', 'attachments'), key_hash)}, set()))

    def test_transient_audit_exception_never_covers_live_table_reference(self):
        key_hash = hashlib.sha256(self.key.encode()).hexdigest()
        result = {'references': [{'table': ['public', 'audit_log'], 'keys': [self.key]}],
                  'occurrences': [{'table': ['public', 'audit_log'], 'keySha256': key_hash,
                                   'fieldPath': ['metadata', 'r2Key'], 'transientAuditValidated': True}]}
        self.assertTrue(scan.validate_object_coverage(result, {}, {}, [], set(), {key_hash}))
        result['references'].append({'table': ['public', 'other'], 'keys': [self.key]})
        with self.assertRaises(ValueError):
            scan.validate_object_coverage(result, {}, {}, [], set(), {key_hash})

    def test_transient_audit_exception_rejects_mixed_same_table_occurrences(self):
        key_hash = hashlib.sha256(self.key.encode()).hexdigest()
        result = {'references': [{'table': ['public', 'audit_log'], 'keys': [self.key]}],
                  'occurrences': [{'table': ['public', 'audit_log'], 'keySha256': key_hash,
                                   'fieldPath': ['metadata', 'r2Key'], 'transientAuditValidated': True},
                                  {'table': ['public', 'audit_log'], 'keySha256': key_hash,
                                   'fieldPath': ['summary'], 'transientAuditValidated': False}]}
        with self.assertRaises(ValueError):
            scan.validate_object_coverage(result, {}, {}, [], set(), {key_hash})

    def test_approved_attachment_exception_does_not_cover_other_table(self):
        key_hash = hashlib.sha256(self.key.encode()).hexdigest()
        result = {'references': [{'table': ['public', 'attachments'], 'keys': [self.key]}],
                  'occurrences': [{'table': ['public', 'attachments'], 'keySha256': key_hash,
                                   'fieldPath': ['r2_key'], 'transientAuditValidated': False}]}
        allowed = {(('public', 'attachments'), key_hash)}
        self.assertTrue(scan.validate_object_coverage(result, {}, {}, [], allowed, set()))
        result['references'].append({'table': ['public', 'other'], 'keys': [self.key]})
        with self.assertRaises(ValueError):
            scan.validate_object_coverage(result, {}, {}, [], allowed, set())

    def test_approved_missing_attachment_rejects_another_field_occurrence(self):
        result = self.execute()
        key_hash = hashlib.sha256(self.key.encode()).hexdigest()
        result['occurrences'].append({'table': ['public', 'attachments'], 'keySha256': key_hash,
                                      'fieldPath': ['metadata', 'objectKey'], 'transientAuditValidated': False})
        with self.assertRaises(ValueError):
            scan.validate_object_coverage(result, {}, {}, [],
                                          {(('public', 'attachments'), key_hash)}, set())

    def test_extra_classified_but_missing_reference_is_rejected(self):
        result = self.execute()
        result['references'].append({'table': ['public', 'other'], 'keys': [self.key + '.extra']})
        key_hash = hashlib.sha256(self.key.encode()).hexdigest()
        versions = [{'keySha256': key_hash, 'latest': True, 'kind': 'Version', 'size': 123}]
        with self.assertRaises(ValueError):
            scan.validate_object_coverage(result, {self.key: 123},
                                          {self.key: {'size': 123, 'contentType': 'application/pdf'}},
                                          versions, set(), set())

    def test_unapproved_sql_and_observer_lock_timeout_rejected(self):
        with self.assertRaises(ValueError):
            list(scan.execute_table({'approvedReadOnlySqlSha256': []}, 'public', 'attachments'))
        sql = scan.table_statement('public', 'attachments')
        config = {'sourceSha': self.sha, 'approvedReadOnlySqlSha256': [hashlib.sha256(sql.encode()).hexdigest()]}
        @contextlib.contextmanager
        def blocked():
            raise TimeoutError('observation lock unavailable')
            yield
        with patch.object(scan.observer, 'postgres_observation_lock', blocked):
            with self.assertRaises(TimeoutError):
                list(scan.execute_table(config, 'public', 'attachments'))
        @contextlib.contextmanager
        def unlocked():
            yield
        with patch.object(scan.observer, 'postgres_observation_lock', unlocked), \
             patch.object(scan.observer, 'execute', return_value=b'{"overflow":true}'):
            with self.assertRaises(ValueError):
                list(scan.execute_table(config, 'public', 'attachments'))
        with patch.object(scan.observer, 'postgres_observation_lock', unlocked), \
             patch.object(scan.observer, 'execute', return_value=b'{"overflow":false,"rows":[]}'), \
             patch.object(scan.time, 'monotonic', side_effect=[0, 1.6]):
            with self.assertRaises(ValueError):
                list(scan.execute_table(config, 'public', 'attachments'))


if __name__ == '__main__':
    unittest.main()
