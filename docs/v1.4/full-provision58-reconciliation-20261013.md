# Full provisioning prefix-58 reconciliation

Result: independent reference validated; DEV migration readiness remains BLOCKED.

The complete historical provisioning contract was run in disposable PostgreSQL 16.15, followed by the historical migration runner and RLS installer. Exactly 58 journal entries were applied. Both historical and candidate SQL blobs and first-58 journal identities match. The runner removes broad public default privileges before SQL execution; provisioning was not rerun afterward.

Reference fingerprint:
`942914410d55ba7b8b7bb52e50b88bef8b162fbee1eb983f33f534d27740b32d`

Live offline comparison reused the protected DEV export. Its SHA256 was checked; no metadata was recollected and no database connection was made. All 58 ledger identities match. **15/19 sections match**, improved from the earlier 13/19 result.

| Section | Remaining difference |
|---|---|
| 7 functions | 67 of 75 differ only in owner: reference postgres, DEV uvanoo_dev. Overloaded functions were paired by identity and argument hash; definitions and ACLs match. |
| 10 types | gtrgm and _gtrgm differ only in owner. |
| 13 default ACLs | DEV has two extra beaconhs_owner/public defaults: app/super CRUD on future tables and USAGE/SELECT/UPDATE on future sequences; backup SELECT. All six other defaults match. |
| 17 extensions | plpgsql 1.0, pgcrypto 1.3 and pg_trgm 1.6 differ only in owner. |

Schemas including ETL, five canonical role configurations, role memberships, existing object ownership/ACLs, policies, RLS flags, triggers, constraints, indexes and sequences match. The nine global RLS exceptions remain canonical. Counts are 227 tables, 218 RLS, 219 FORCE, 226 policies, 16 enabled non-internal triggers and zero disabled triggers.

The reference bootstrap role comes from repository Compose/provisioning instructions. DEV ownership is an unresolved deployment-profile difference, not by itself proof of an exploit. Do not derive canonical defaults from DEV. The existing export excludes non-beaconhs role attributes and extension dependency membership; independently approved bootstrap provenance and those read-only checks remain necessary.

The two public default ACLs conflict with the historical runner's post-provisioning contract. They can grant access automatically to future objects. Do not rerun broad provision.sql against existing module permissions or permit migration to silently repair a failed preflight. Any narrowly scoped correction requires separate approval, protected backup and verified restore first.

Passing focused run: https://github.com/Satho82/beaconhs/actions/runs/38370329844
Validation harness commit: 0367958d15fb6f7b5f428a77adf3dcb737a8d0e6
Failed pre-migration archive-buffer attempt retained: https://github.com/Satho82/beaconhs/actions/runs/38370104534

The adjacent JSON manifest records exact source/tree/image/artifact hashes and comparison evidence. Public artifacts contain hashes and object identities, not raw definitions. Canonical raw metadata is encrypted to the owner's registered SSH keys, retained for 30 days (expires 12 November 2026). Decryption/restore rehearsal is not claimed.

## Secure replay on the VPS

Use the existing private directory created during this audit; no database export or SQL is required:

```sh
test "$(sha256sum /home/ubuntu/uvanoo-preflight/full-provision58.JtKnCbct/reference-public.json | cut -d ' ' -f 1)" = 7ea9674a30f03882957e1cd0ad7fd420661b76de940f0126a63e3a35f9baceee &&
test "$(git hash-object /home/ubuntu/uvanoo-preflight/full-provision58.JtKnCbct/compare.mjs)" = 9657d059304db12b4e5186cae1048c025c5f503d &&
node /home/ubuntu/uvanoo-preflight/full-provision58.JtKnCbct/compare.mjs \
  /home/ubuntu/uvanoo-preflight/full-provision58.JtKnCbct/reference-public.json \
  /home/ubuntu/uvanoo-preflight/dev-metadata.jsonl \
  51959099c665622286fc2a13bb771f64574b518f81dfcee67ea7524ed68f933d
```

Expected current exit code: 2 (schema mismatch), ledger PASS. Keep outputs private.

Before 58-to-63: resolve the two issues without weakening the gate; verify encrypted database/storage backups and independent restore; reconcile clean155 data and Redis queues; establish writer fencing/re-fencing and immutable source/tree/image binding. No recovery changes are authorized by this evidence report.

The documented next-release DEV-only removal of the Traefik Basic Auth popup remains required, while native authentication, RBAC/RLS and internal-service isolation remain intact. No Traefik change was made.
