"""Compare private, exhaustive inventories on stdin; never print object identities.

This does not discover objects or certify inventory provenance. Collect from a
verified isolated COPY and the restored DB, never initialize the retained store.
"""
import json
import sys
import dev_recovery as r


def index(rows):
    result = {}
    for row in rows:
        r.require(set(row) == {'bucket', 'key', 'version', 'bytes', 'sha256'},
                  'OBJECT_RECORD_FIELDS_REJECTED')
        r.require(all(isinstance(row[k], str) and row[k] for k in ('bucket', 'key', 'version'))
                  and type(row['bytes']) is int and row['bytes'] >= 0 and
                  isinstance(row['sha256'], str) and r.HEX.fullmatch(row['sha256']),
                  'OBJECT_RECORD_REJECTED')
        key = (row['bucket'], row['key'], row['version'])
        r.require(key not in result, 'DUPLICATE_OBJECT_RECORD')
        result[key] = (row['bytes'], row['sha256'])
    return result


def compare(value):
    r.require(set(value) == {'expected', 'actual', 'scopeReceiptSha256',
                            'allPagesCollected', 'bucketMetadataVerified'},
              'STORAGE_INPUT_FIELDS_REJECTED')
    r.require(value['allPagesCollected'] is True and value['bucketMetadataVerified'] is True
              and isinstance(value['scopeReceiptSha256'], str)
              and r.HEX.fullmatch(value['scopeReceiptSha256']), 'STORAGE_SCOPE_UNPROVEN')
    expected, actual = index(value['expected']), index(value['actual'])
    missing = expected.keys()-actual.keys()
    extra = actual.keys()-expected.keys()
    mismatch = sum(expected[k] != actual[k] for k in expected.keys() & actual.keys())
    return dict(inventoryComparison='PASS' if not (missing or mismatch or extra) else 'FAIL',
                expectedObjects=len(expected), actualObjects=len(actual),
                missingObjects=len(missing), unexplainedObjects=len(extra),
                mismatchedObjects=mismatch, completenessClaim='REQUIRES_INDEPENDENT_SCOPE_ACCEPTANCE')


if __name__ == '__main__':
    try:
        result = compare(json.load(sys.stdin))
        print(json.dumps(result, sort_keys=True))
        sys.exit(0 if result['inventoryComparison'] == 'PASS' else 1)
    except Exception:
        print('{"error":"PRIVATE_STORAGE_COMPARISON_REJECTED"}', file=sys.stderr)
        sys.exit(1)
