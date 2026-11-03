#!/usr/bin/env python3
"""Bounded, read-only DEV table reference scanner; classification is separate.

No output is release evidence until a reviewer classifies every discovered
reference and the governed collector accepts the actual fenced observations.
"""
import datetime
import hashlib
import html
import json
import re
import subprocess
import sys
import time
from urllib.parse import unquote
from pathlib import Path

import collect_release_observations as observer

IDENT = re.compile(r'^[a-z_][a-z0-9_]{0,62}$')
SOURCE = re.compile(r'^[a-f0-9]{40}$')
KEY_START = re.compile(r'^(?:t/[0-9a-f-]{36}/|tenants/[0-9a-f-]{36}/branding/|platform/branding/)', re.I)
KEY_ANY = re.compile(r'(?:t/[0-9a-f-]{36}/|tenants/[0-9a-f-]{36}/branding/|platform/branding/)', re.I)
KEY_FIELDS = frozenset({'r2key', 's3key', 'objectkey', 'storagekey', 'stagingkey',
                        'blobkey', 'bucketkey', 'filekey', 'attachmentkey'})
SUSPICIOUS_FIELD = re.compile(r'(?:r2|s3|object|storage|staging|blob|bucket|attachment|file).*key$')
MAX_ROWS = 100_000
MAX_JSON_BYTES = 2_000_000
MAX_DEPTH = 64


def require(condition):
    if not condition:
        raise ValueError('DEV_FULL_REFERENCE_SCAN_REJECTED')


def quoted_ident(value):
    require(isinstance(value, str) and IDENT.fullmatch(value) is not None)
    return '"' + value + '"'


def table_statement(schema, table, primary_key=(), offset=0):
    relation = quoted_ident(schema) + '.' + quoted_ident(table)
    require(type(offset) is int and 0 <= offset <= MAX_ROWS)
    require(isinstance(primary_key, (tuple, list)) and len(primary_key) <= 16)
    require(len(primary_key) == len(set(primary_key)))
    order = ','.join(quoted_ident(key) for key in primary_key)
    require(bool(order) or offset == 0)
    paging = (' ORDER BY ' + order + ' LIMIT 1000 OFFSET ' + str(offset)) if order else ' LIMIT 100001'
    # The CASE prevents oversized data from being returned. A bounded temporary
    # space limit and statement timeout also apply while materializing the CTE.
    return ("BEGIN READ ONLY; SET LOCAL statement_timeout='1200ms'; "
            "SET LOCAL temp_file_limit='8192kB'; SET LOCAL work_mem='1MB'; "
            "WITH rows AS MATERIALIZED (SELECT row_to_json(t)::text AS js FROM " + relation +
            " t" + paging + "), totals AS (SELECT count(*) AS n, "
            "coalesce(sum(octet_length(js)),0) AS bytes FROM rows) "
            "SELECT CASE WHEN n>100000 OR bytes>2000000 THEN "
            "json_build_object('overflow',true) ELSE json_build_object('overflow',false,"
            "'rows',coalesce((SELECT json_agg(js::json) FROM rows),'[]'::json)) END "
            "FROM totals; ROLLBACK;")


def count_statement(schema, table):
    relation = quoted_ident(schema) + '.' + quoted_ident(table)
    return ("BEGIN READ ONLY; SET LOCAL statement_timeout='1200ms'; "
            "SELECT count(*) FROM " + relation + "; ROLLBACK;")


def execute_count(config, schema, table):
    sql = count_statement(schema, table)
    require(hashlib.sha256(sql.encode()).hexdigest() in config['approvedReadOnlySqlSha256'])
    with observer.postgres_observation_lock():
        start = time.monotonic()
        raw = observer.execute(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on',
                                '-e', 'PGAPPNAME=uvanoo-verify:' + config['sourceSha'],
                                'uvanoo-dev-postgres', 'psql', '-X', '-qAt', '-U', 'uvanoo_dev',
                                '-d', 'uvanoo_dev', '-v', 'ON_ERROR_STOP=1'], sql.encode())
        require(time.monotonic() - start < 1.5)
    value = int(raw.strip())
    require(0 <= value <= MAX_ROWS)
    return value


def plan_page_hashes(table_scope, primary_keys, counts):
    """Return exact page SQL hashes for independent preapproval, never approval itself."""
    tables = sorted(tuple(item) for item in table_scope)
    require(len(tables) == len(set(tables)) and set(counts) == set(tables))
    require(set(primary_keys).issubset(set(tables)))
    result = []
    for table in tables:
        count = counts[table]
        require(type(count) is int and 0 <= count <= MAX_ROWS)
        keys = primary_keys.get(table, ())
        offsets = range(0, count + 1, 1000) if keys else [0]
        for offset in offsets:
            sql = table_statement(*table, keys, offset)
            result.append({'table': list(table), 'offset': offset,
                           'sqlSha256': hashlib.sha256(sql.encode()).hexdigest()})
    return result


def extract_occurrences(value, field='', depth=0, path=()):
    require(depth <= MAX_DEPTH)
    found = []
    if isinstance(value, dict):
        for key, item in value.items():
            require(isinstance(key, str))
            found.extend(extract_occurrences(item, key, depth + 1, path + (key,)))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(extract_occurrences(item, field, depth + 1, path + (str(index),)))
    elif isinstance(value, str):
        require(len(value.encode()) <= MAX_JSON_BYTES)
        name = field.lower().replace('_', '')
        decoded = unquote(html.unescape(value))
        require(not (KEY_ANY.search(decoded) and not KEY_ANY.search(value)))
        require(re.search(r'(?:s3://|gs://|r2\.cloudflarestorage\.com|\.blob\.core\.windows\.net)', decoded, re.I) is None)
        match = KEY_ANY.search(value)
        if name in KEY_FIELDS or SUSPICIOUS_FIELD.search(name):
            require(bool(value) and KEY_START.match(value) is not None)
            found.append((value, path))
        elif match:
            require(match.start() == 0 and KEY_START.match(value) is not None)
            found.append((value, path))
    elif value is not None:
        name = field.lower().replace('_', '')
        require(not (name in KEY_FIELDS or SUSPICIOUS_FIELD.search(name)))
    return found


def extract_references(value, field='', depth=0):
    return {key for key, _ in extract_occurrences(value, field, depth)}


def transient_audit_occurrence(table, row, key, path):
    if table != ('public', 'audit_log') or path != ('metadata', 'r2Key'):
        return False
    metadata = row.get('metadata')
    tenant = row.get('tenant_id')
    return (isinstance(metadata, dict) and metadata.get('r2Key') == key and
            metadata.get('transient') is True and metadata.get('attachmentId') is None and
            isinstance(tenant, str) and re.fullmatch(r'[0-9a-f-]{36}', tenant) is not None and
            key.startswith('t/' + tenant + '/_transient/pdfs/') and row.get('action') == 'export')


def scan(scope, discover_tables, read_rows, observe_state, source_sha, expected_counts=None, count_rows=None):
    require(SOURCE.fullmatch(source_sha) is not None)
    require(isinstance(scope, list) and scope and len(scope) <= 1000)
    expected = sorted(tuple(item) for item in scope)
    require(len(expected) == len(set(expected)))
    for schema, table in expected:
        quoted_ident(schema)
        quoted_ident(table)
    before = observe_state()
    actual = sorted(tuple(item) for item in discover_tables())
    require(actual == expected)
    if expected_counts is not None:
        require(count_rows is not None and set(expected_counts) == set(actual))
        for schema, table in actual:
            require(count_rows(schema, table) == expected_counts[(schema, table)])
    results = []
    occurrences = []
    for schema, table in actual:
        rows = read_rows(schema, table)
        require(hasattr(rows, '__iter__') and not isinstance(rows, (str, bytes, dict)))
        keys = set()
        row_count = 0
        for row in rows:
            row_count += 1
            require(row_count <= MAX_ROWS and isinstance(row, dict))
            try:
                found = extract_occurrences(row)
                for key, path in found:
                    keys.add(key)
                    occurrences.append({'table': [schema, table],
                        'rowSha256': hashlib.sha256(observer.canonical(row)).hexdigest(),
                        'fieldPath': list(path), 'keySha256': hashlib.sha256(key.encode()).hexdigest(),
                        'transientAuditValidated': transient_audit_occurrence((schema, table), row, key, path)})
            except ValueError as exc:
                raise ValueError('DEV_REFERENCE_FORM_UNCLASSIFIED:' + schema + '.' + table) from exc
        if expected_counts is not None:
            require(row_count == expected_counts[(schema, table)])
            require(count_rows(schema, table) == expected_counts[(schema, table)])
        if keys:
            results.append({'table': [schema, table], 'keys': sorted(keys)})
        require(observe_state() == before)
    if expected_counts is not None:
        for schema, table in actual:
            require(count_rows(schema, table) == expected_counts[(schema, table)])
    require(observe_state() == before)
    return {'sourceSha': source_sha, 'tables': [list(t) for t in actual], 'references': results,
            'occurrences': occurrences, 'status': 'SCANNED_UNCLASSIFIED', 'allReferencesCovered': False,
            'releaseAdmitted': False}


def validate_classifications(result, review):
    """Check exact reviewed table/key identities; missing/extra keys fail closed."""
    require(result['status'] == 'SCANNED_UNCLASSIFIED')
    require(review['sourceSha'] == result['sourceSha'] and review['status'] == 'REVIEWED')
    require(review['columnScopeSha256'] == result['columnScopeSha256'])
    require(review['primaryKeyScopeSha256'] == result['primaryKeyScopeSha256'])
    require(review['rowCountsSha256'] == result['rowCountsSha256'])
    require(result['snapshotModel'] == 'GUARDED_MULTITRANSACTION_WITH_EXPLICIT_PRIVILEGED_OPERATOR_RISK')
    require(review['sourceReferencePathsReviewed'] is True and review['unknownFormsResolved'] is True)
    require(review['scanSha256'] == hashlib.sha256(observer.canonical(result)).hexdigest())
    require(isinstance(review['reviewer'], str) and review['reviewer'].strip())
    from collections import Counter
    expected = Counter((tuple(item['table']), item['rowSha256'], tuple(item['fieldPath']), item['keySha256'])
                       for item in result['occurrences'])
    reference_pairs = {(tuple(item['table']), hashlib.sha256(key.encode()).hexdigest())
                       for item in result['references'] for key in item['keys']}
    require({(table, key_hash) for table, _, _, key_hash in expected} == reference_pairs)
    supplied = Counter()
    for item in review['classifications']:
        require(set(item) == {'table', 'rowSha256', 'fieldPath', 'keySha256', 'category'})
        require(item['category'] in {'attachment', 'reservation', 'audit', 'branding', 'other-reviewed'})
        require(re.fullmatch(r'[a-f0-9]{64}', item['keySha256']) is not None)
        require(re.fullmatch(r'[a-f0-9]{64}', item['rowSha256']) is not None)
        require(isinstance(item['fieldPath'], list) and item['fieldPath'] and
                all(isinstance(part, str) and part for part in item['fieldPath']))
        identity = (tuple(item['table']), item['rowSha256'], tuple(item['fieldPath']), item['keySha256'])
        supplied[identity] += 1
    require(supplied == expected)
    return {'status': 'CLASSIFICATIONS_MATCHED', 'unclassifiedAdditionalKeys': 0,
            'classifiedReferences': len(expected), 'releaseAdmitted': False}


def validate_scan_binding(result, config, samples):
    require(result['sourceSha'] == config['sourceSha'])
    require(result['databaseOid'] == config['databaseOid'])
    require(result['imageDigest'] == config['imageDigest'])
    require(isinstance(samples, list) and samples)
    start = observer.timestamp(result['startedAt'])
    end = observer.timestamp(result['finishedAt'])
    require(start <= end)
    require(observer.timestamp(samples[0]['observedAt']) <= start)
    require(end <= observer.timestamp(samples[-1]['observedAt']))
    return True


def validate_manifest_binding(result, config, manifest):
    require(result['sourceSha'] == config['sourceSha'] == manifest['sourceSha'])
    require(result['databaseOid'] == config['databaseOid'] == manifest['databaseOid'])
    require(result['imageDigest'] == config['imageDigest'] == manifest['imageDigest'])
    return True


def validate_object_coverage(result, objects, metadata, versions, allowed_missing_identities,
                             transient_audit_hashes):
    """Bind every missing exception to its table; transient audit must be audit-only."""
    require(isinstance(objects, dict) and isinstance(metadata, dict) and isinstance(versions, list))
    references = {}
    for entry in result['references']:
        table = tuple(entry['table'])
        for key in entry['keys']:
            key_hash = hashlib.sha256(key.encode()).hexdigest()
            references.setdefault(key_hash, set()).add(table)
    for reference in result['references']:
        table = tuple(reference['table'])
        for key in reference['keys']:
            key_hash = hashlib.sha256(key.encode()).hexdigest()
            if key not in objects:
                relevant = [item for item in result.get('occurrences', []) if item['keySha256'] == key_hash]
                allowed_paths = {('public', 'attachments'): {('r2_key',)},
                                 ('public', 'tenants'): {('branding', 'logoUrl'), ('branding', 'pdfLetterhead')},
                                 ('public', 'platform_settings'): {('branding', 'logoKey'), ('branding', 'faviconKey')}}
                approved_for_table = ((table, key_hash) in allowed_missing_identities and relevant and
                                      all(tuple(item['table']) == table and
                                          tuple(item['fieldPath']) in allowed_paths.get(table, set())
                                          for item in relevant))
                audit_only = (table == ('public', 'audit_log') and key_hash in transient_audit_hashes and
                              references[key_hash] == {('public', 'audit_log')} and relevant and
                              all(item['table'] == ['public', 'audit_log'] and
                                  item['fieldPath'] == ['metadata', 'r2Key'] and
                                  item['transientAuditValidated'] is True for item in relevant))
                require(approved_for_table or audit_only)
                continue
            require(key in metadata and type(objects[key]) is int and objects[key] >= 0)
            head = metadata[key]
            require(head['size'] == objects[key] and isinstance(head['contentType'], str) and bool(head['contentType']))
            latest = [item for item in versions if item['keySha256'] == key_hash and item['latest'] is True]
            require(len(latest) == 1 and latest[0]['kind'] == 'Version' and latest[0]['size'] == objects[key])
    return True


def execute_table(config, schema, table, primary_key=(), observe_state=None):
    total = 0
    before = observe_state() if observe_state is not None else None
    for offset in range(0, MAX_ROWS + 1, 1000):
        if not primary_key and offset:
            raise ValueError('DEV_UNPAGEABLE_TABLE')
        sql = table_statement(schema, table, primary_key, offset)
        digest = hashlib.sha256(sql.encode()).hexdigest()
        require(digest in config['approvedReadOnlySqlSha256'])
        with observer.postgres_observation_lock():
            start = time.monotonic()
            raw = observer.execute(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on',
                                    '-e', 'PGAPPNAME=uvanoo-verify:' + config['sourceSha'],
                                    'uvanoo-dev-postgres', 'psql', '-X', '-qAt', '-U', 'uvanoo_dev',
                                    '-d', 'uvanoo_dev', '-v', 'ON_ERROR_STOP=1'], sql.encode())
            require(time.monotonic() - start < 1.5)
        data = json.loads(raw)
        require(set(data) == {'overflow', 'rows'} and data['overflow'] is False)
        require(len(observer.canonical(data['rows'])) <= MAX_JSON_BYTES)
        require(isinstance(data['rows'], list) and (not primary_key or len(data['rows']) <= 1000))
        total += len(data['rows'])
        require(total <= MAX_ROWS)
        if observe_state is not None:
            require(observe_state() == before)
        yield from data['rows']
        if not primary_key or len(data['rows']) < 1000:
            return
    raise ValueError('DEV_TABLE_ROW_LIMIT_EXCEEDED')


TABLE_STATEMENT = ("BEGIN READ ONLY; SET LOCAL statement_timeout='1200ms'; "
                   "SELECT json_build_object('tables',coalesce(json_agg(json_build_array(n.nspname,c.relname) "
                   "ORDER BY n.nspname,c.relname) FILTER (WHERE n.nspname<>'drizzle'),'[]'::json), "
                   "'ledgerCount',count(*) FILTER (WHERE n.nspname='drizzle' AND c.relname='__drizzle_migrations'), "
                   "'otherDrizzleTables',count(*) FILTER (WHERE n.nspname='drizzle' AND c.relname<>'__drizzle_migrations'), "
                   "'columns',(SELECT coalesce(json_agg(json_build_array(n2.nspname,c2.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) ORDER BY n2.nspname,c2.relname,a.attnum),'[]'::json) FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid=c2.relnamespace JOIN pg_attribute a ON a.attrelid=c2.oid AND a.attnum>0 AND NOT a.attisdropped WHERE c2.relkind IN ('r','p') AND n2.nspname !~ '^pg_' AND n2.nspname NOT IN ('information_schema','drizzle')), "
                   "'primaryKeys',(SELECT coalesce(json_agg(json_build_object('table',json_build_array(n3.nspname,c3.relname),'columns',(SELECT json_agg(a3.attname ORDER BY k.ordinality) FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum,ordinality) JOIN pg_attribute a3 ON a3.attrelid=c3.oid AND a3.attnum=k.attnum WHERE k.ordinality<=i.indnkeyatts)) ORDER BY n3.nspname,c3.relname),'[]'::json) FROM pg_index i JOIN pg_class c3 ON c3.oid=i.indrelid JOIN pg_namespace n3 ON n3.oid=c3.relnamespace WHERE i.indisprimary AND i.indisvalid AND i.indisready AND c3.relkind IN ('r','p') AND n3.nspname !~ '^pg_' AND n3.nspname NOT IN ('information_schema','drizzle'))) "
                   "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                   "WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'; ROLLBACK;")


def validate_primary_scope(data):
    tables = {tuple(table) for table in data['tables']}
    columns = {(item[0], item[1], item[2]): item for item in data['columns']}
    require(len(columns) == len(data['columns']))
    seen = set()
    for item in data['primaryKeys']:
        table = tuple(item['table'])
        require(table in tables and table not in seen)
        seen.add(table)
        keys = item['columns']
        require(isinstance(keys, list) and 0 < len(keys) <= 16 and len(keys) == len(set(keys)))
        for key in keys:
            quoted_ident(key)
            column = columns[(*table, key)]
            require(len(column) == 5 and column[4] is True)
    return True


def execute_discovery(config):
    digest = hashlib.sha256(TABLE_STATEMENT.encode()).hexdigest()
    require(digest in config['approvedReadOnlySqlSha256'])
    with observer.postgres_observation_lock():
        start = time.monotonic()
        raw = observer.execute(['docker', 'exec', '-i', '-e', 'PGOPTIONS=-c default_transaction_read_only=on',
                                '-e', 'PGAPPNAME=uvanoo-verify:' + config['sourceSha'],
                                'uvanoo-dev-postgres', 'psql', '-X', '-qAt', '-U', 'uvanoo_dev',
                                '-d', 'uvanoo_dev', '-v', 'ON_ERROR_STOP=1'], TABLE_STATEMENT.encode())
        require(time.monotonic() - start < 1.5)
    data = json.loads(raw)
    require(set(data) == {'tables', 'ledgerCount', 'otherDrizzleTables', 'columns', 'primaryKeys'})
    require(hashlib.sha256(observer.canonical(data['columns'])).hexdigest() == config['fullReferenceColumnScopeSha256'])
    require(data['ledgerCount'] == 1 and data['otherDrizzleTables'] == 0)
    validate_primary_scope(data)
    require(hashlib.sha256(observer.canonical(data['primaryKeys'])).hexdigest() == config['fullReferencePrimaryKeyScopeSha256'])
    return data


def capture_state(config):
    services, tasks = observer.zero_state()
    observer.validate_zero_baseline(services, tasks, config['zeroBaseline'])
    postgres = observer.pg_observation(config)
    require(postgres['oid'] == config['databaseOid'] and postgres['wopiEvents'] == 0)
    require(postgres['stats'] == config['databaseWriteCounters'])
    capture = observer.capture_proxy(config)
    return {'databaseOid': postgres['oid'], 'databaseWriteCounters': postgres['stats'],
            'wopiEvents': 0, 'captureProxyConfigSha256': capture}


def verify_tooling(repo, source_sha, expected, git=subprocess.check_output):
    """Bind the actual scanner, collector and guard bytes to one immutable commit."""
    require(SOURCE.fullmatch(source_sha) is not None)
    files = ['full_reference_scan.py', 'collect_release_observations.py', 'capture_fence_guard.py']
    require(set(expected) == set(files))
    head = git(['git', '-C', str(repo), 'rev-parse', 'HEAD'], timeout=5).decode().strip()
    require(head == source_sha)
    for name in files:
        relative = 'scripts/cluster/dev-recovery/' + name
        path = repo / relative
        require(path.resolve() == path and path.is_file())
        blob = git(['git', '-C', str(repo), 'show', source_sha + ':' + relative], timeout=5)
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        require(actual_hash == hashlib.sha256(blob).hexdigest() == expected[name])
    return True


def run_live(config, table_scope):
    started_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    require(config['target'] == observer.TARGET)
    verify_tooling(Path(__file__).resolve().parents[3], config['toolingSourceSha'], config['toolingBlobSha256'])
    discovered = {}
    def tables():
        data = execute_discovery(config)
        discovered.update({tuple(item['table']): item['columns'] for item in data['primaryKeys']})
        return data['tables']
    counts = {tuple(item['table']): item['count'] for item in config['fullReferenceRowCounts']}
    require(len(counts) == len(config['fullReferenceRowCounts']))
    result = scan(table_scope, tables,
                  lambda schema, table: execute_table(config, schema, table,
                      discovered.get((schema, table), ()), lambda: capture_state(config)),
                  lambda: capture_state(config), config['sourceSha'], counts,
                  lambda schema, table: execute_count(config, schema, table))
    result['rowCountsSha256'] = hashlib.sha256(observer.canonical(config['fullReferenceRowCounts'])).hexdigest()
    result['snapshotModel'] = 'GUARDED_MULTITRANSACTION_WITH_EXPLICIT_PRIVILEGED_OPERATOR_RISK'
    result['scannerSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    require(result['scannerSha256'] == config['fullReferenceScannerSha256'])
    result['startedAt'] = started_at
    result['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result['columnScopeSha256'] = config['fullReferenceColumnScopeSha256']
    result['primaryKeyScopeSha256'] = config['fullReferencePrimaryKeyScopeSha256']
    result['toolingSourceSha'] = config['toolingSourceSha']
    require(SOURCE.fullmatch(result['toolingSourceSha']) is not None)
    return result


def main():
    """Scan only against a private, source-bound reviewed DEV configuration."""
    import datetime
    import os
    require(len(sys.argv) == 4)
    config_path, scope_path, output_path = map(Path, sys.argv[1:])
    config = observer.private_json(config_path)
    scope_pin = config['fullReferenceTableScope']
    require(str(scope_path) == scope_pin['path'])
    scope = observer.private_json(scope_path, scope_pin['sha256'])
    require(scope['status'] == 'STRUCTURAL_SCOPE_REVIEWED' and scope['sourceSha'] == config['sourceSha'])
    require(scope['migrationLedgerTables'] == 1)
    result = run_live(config, scope['tables'])
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', config['imageDigest']) is not None)
    result['imageDigest'] = config['imageDigest']
    result['databaseOid'] = config['databaseOid']
    result['observedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    expected_parent = Path('/opt/uvanoo-dev/release-evidence') / config['sourceSha']
    require(output_path.parent == expected_parent and expected_parent.resolve() == expected_parent)
    require(not output_path.exists() and not output_path.is_symlink())
    fd = os.open(output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(result, f, ensure_ascii=False, sort_keys=True)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    print(json.dumps({'status': result['status'], 'tablesScanned': len(result['tables']),
                      'referenceTables': len(result['references']), 'releaseAdmitted': False}))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('DEV_FULL_REFERENCE_SCAN_REJECTED', file=sys.stderr)
        raise SystemExit(1)
