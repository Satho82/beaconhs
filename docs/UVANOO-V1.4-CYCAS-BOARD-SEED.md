# Cycas Board demo — 15 October 2026

Status: implementation and disposable-database validation only. **Live DEV seed
not executed.** Feature freeze is 12 October. No migration, deployment or runtime
configuration change is part of this package.

## Protected existing data

The current Vertiq tenant is `f6d43808-18d4-4526-81b9-651e30aef383`.
Its original hotel is `94f6031e-3d3d-4b5a-9584-b13c3aeb8381`.
Antonio's manual **Lincoln Suites** is
`089ff362-aa28-488f-bbf3-b829db65520a`. None is renamed, reused, updated,
archived or deleted by this seed.

Cycas is a separate tenant named **Cycas Hospitality**, with slug
`cycas-hospitality-demo` and deterministic ID `cycasId('tenant')`. IDs retain
the existing `cycas-hospitality-portfolio-v1` namespace. Existing rows from an
older or partial seed cause refusal rather than automatic repair.

## Property structure

| Property            | Code | Building        | Floors             | Room counts by floor   | Total |
| ------------------- | ---- | --------------- | ------------------ | ---------------------- | ----- |
| One Fifty Fenchurch | OFF  | Fenchurch House | Ground, 1, 2, 3, 4 | 5 / 7 / 7 / 7 / 7      | 33    |
| The Lincoln Suites  | TLS  | Kingsway House  | Ground, 1, 2, 3, 4 | 10 / 11 / 11 / 11 / 11 | 54    |

Stored codes are tenant-unique: `OFF-001` through the specified Fenchurch floor
ranges, and `TLS-001` through the Lincoln ranges. Display names remain
`Room 001`, `Room 101`, etc. This is a fictional demonstration layout, not
a surveyed hotel floor plan.

Fenchurch types include Classic King, Classic Twin, Accessible King and Junior
Suite. Lincoln uses Studio, Accessible Studio and One Bedroom Suite. Each hotel
includes occupied, available, maintenance, blocked and out-of-service examples.
Every room has a deterministic QR target.

## Accounts and People

All emails use `@cycas.demo.uvanoo.invalid`. There are **19 staff users,
19 credential accounts, 19 tenant memberships, 19 role assignments, 25 People
including six contractors, and 29 People/property-site assignments**.

| Email local part       | Person / role                              | Property scope |
| ---------------------- | ------------------------------------------ | -------------- |
| demo-admin             | Avery Morgan — Demo Administrator          | Both           |
| cluster-gm             | Jordan Ellis — Cluster GM                  | Both           |
| fenchurch-manager      | Priya Shah — Hotel Manager                 | Fenchurch      |
| lincoln-manager        | Marcus Reed — Hotel Manager                | Lincoln        |
| fenchurch-front-office | Elena Ward — FOH Supervisor                | Fenchurch      |
| lincoln-front-office   | Theo Bennett — FOH Supervisor              | Lincoln        |
| engineer               | Nadia Cole — Maintenance Engineer          | Both           |
| safety-compliance      | Riley Brooks — Safety / Compliance Manager | Both           |
| restricted-operations  | Jamie Blake — Restricted Operations        | Lincoln        |
| fenchurch.gm           | Amelia Hart — General Manager              | Fenchurch      |
| fenchurch.maintenance  | Daniel Okafor — Maintenance Manager        | Fenchurch      |
| fenchurch.duty         | Sofia Martinez — Duty Manager              | Fenchurch      |
| fenchurch.engineer     | Liam Chen — Hotel Engineer                 | Fenchurch      |
| fenchurch.front-office | Maya Patel — FOH Supervisor                | Fenchurch      |
| lincoln.gm             | Oliver Grant — General Manager             | Lincoln        |
| lincoln.maintenance    | Aisha Khan — Maintenance Manager           | Lincoln        |
| lincoln.duty           | Isabel Costa — Duty Manager                | Lincoln        |
| lincoln.engineer       | Leo Martin — Hotel Engineer                | Lincoln        |
| lincoln.front-office   | Freya Wilson — FOH Supervisor              | Lincoln        |

Six role definitions: admin, manager, frontOffice, engineer, safety, restricted.
No demo identity is a platform Super Admin. The demo administrator remains
property-scoped to these two hotels. Restricted Staff has read-only hospitality,
maintenance and diary permissions. Operational author/assignee identities have
matching memberships, People and property scopes.

Contractors are fictional lift, fire and HVAC specialists, three assigned to
each hotel's site. They have People records but no login accounts.

## Planned data counts

| Dataset                                  | Per hotel                | Total      |
| ---------------------------------------- | ------------------------ | ---------- |
| Properties / buildings                   | 1 / 1                    | 2 / 2      |
| Floors                                   | 5                        | 10         |
| Rooms / QR targets                       | 33 Fenchurch; 54 Lincoln | 87 / 87    |
| Maintenance issues                       | 12                       | 24         |
| Work orders                              | 8                        | 16         |
| Task templates / schedules               | 8 / 8                    | 16 / 16    |
| Diary occurrences                        | 12                       | 24         |
| Task lifecycle events                    | 4                        | 8          |
| Historical manager sign-offs             | 4                        | 8          |
| H&S registry topics                      | 22                       | 44         |
| Other document / inspection obligations  | 6                        | 12         |
| All compliance obligations / status rows | 28 / 28                  | 56 / 56    |
| Controlled documents / versions          | 26 / 26                  | 52 / 52    |
| Assets                                   | 5                        | 10         |
| Asset categories / types                 | 1 / 1                    | 2 / 2      |
| PPM schedules                            | 5                        | 10         |
| Inspection types / groups / criteria     | 2 / 2 / 8                | 4 / 4 / 16 |
| Inspection records / recorded answers    | 6 / 24                   | 12 / 48    |
| Corrective actions                       | 6                        | 12         |
| Incidents                                | 3                        | 6          |
| Training courses / records               | 3 / 15                   | 6 / 30     |
| Contractor People                        | 3                        | 6          |

Tenant-wide: one new tenant; three organisation units (company and two sites);
six roles; five immediately enabled Board entitlements; one immutable seed
completion audit/manifest. Entitlements: properties, maintenance, compliance,
diary and manager-signoff.

Dates use a fixed Board anchor, `2026-10-15T12:00:00.000Z`, so repeated runs
do not drift. People assignments start 1 October. Registry due dates agree with
their overdue/expiring/completed states. Training has expired, expiring and
current records; PPM includes overdue and upcoming work. Diary, maintenance,
inspection and incident records span meaningful workflow states.

## Insert-only contract

1. Build every prospective row in memory, with stable IDs and explicit times.
2. Open one database transaction using the explicit maintenance/super client.
3. Lock all affected tables in deterministic order with a five-second timeout.
   This serializes against ordinary application writers, not only other seeds.
4. Check every live unique index, including compound, expression and partial
   indexes, against all proposed and existing rows before the first INSERT.
   Additionally check case-insensitive email and Better Auth provider/account
   identity. Never use `onConflictDoNothing`.
5. Reject any unowned collision, partial old seed or conflicting manifest.
6. Load owner-only credentials only on first insertion, then insert all rows and
   an audit manifest in the same transaction. A failure rolls everything back.
7. An exact rerun checks the plan fingerprint and a fingerprint of every complete
   persisted seed row, including defaults and credential rows, then performs
   **zero writes**. A manually changed seed row causes refusal. New operational
   records are not reset, and existing credentials are never rotated by reruns.

The row fingerprint is stored in the audit manifest, not copies of credentials.
The tenant and supported metadata fields carry the seed namespace; tables without
metadata are covered by the manifest's deterministic row set and fingerprint.

A changed anchor or revised dataset requires a separately designed insert-only
extension; this command will not silently update a previously installed version.

## Credentials

The existing first-identity bootstrap deliberately requires an empty identity
database and one fixed administrator email; it cannot safely provision this
portfolio. The small offline generator reuses **Better Auth's canonical password
hashing**, generates random credentials and exclusively creates a mode-0600 file
outside the repository. It neither connects to the database nor prints passwords.
The seed reads only its hashes and inserts credential accounts transactionally.
Its loader rejects symlinks, non-owner/private permissions and oversized files.

For a **disposable local development/test database only**, explicitly set
`NODE_ENV=development`, `UVANOO_CYCAS_SEED_TARGET=development`,
`UVANOO_CYCAS_SEED_CONFIRM=SEED_CYCAS_HOSPITALITY_DEVELOPMENT`,
`SUPERADMIN_DATABASE_URL`, and an absolute, new
`UVANOO_CYCAS_CREDENTIAL_FILE` outside the checkout. Then:

```sh
pnpm --filter @beaconhs/auth credentials:cycas-demo
pnpm --filter @beaconhs/db seed:cycas-demo
```

Retrieve credentials only through the approved private operator channel.
Do not commit, print, upload as CI artifacts or reuse test credentials for DEV.
There is no new application endpoint and public sign-up remains disabled.
Staging/production targets and runtime environments are rejected.

**Future live DEV execution needs its own authorization and verified target
procedure. These instructions do not authorize or perform that execution.**

## Validation

`scripts/ci/cycas-demo-seed-integration.sh` requires an explicit
`CYCAS_TEST_DATABASE_URL` pointing at a local disposable test database. It uses
rollback-only transactions, including representative Vertiq fixtures with the
live tenant/property/building/floor/room IDs. It does not copy live credentials.

The harness proves exact counts, preservation of every pre-existing fixture row,
an unchanged second run with zero INSERT calls, 19 real Better Auth sign-ins,
and the installed property RLS as `beaconhs_app` for all 19 users. It exercises
tenant/user/property/room/document/manifest collisions, partial-seed rejection,
post-seed manual-edit refusal and rollback after an injected late insertion
failure. All test fixtures are rolled back. Preservation evidence comes from
disposable fixtures, not from seeding the live database.

Both Fast DEV and Full Release run this proof through the auth package’s Vitest
test inside their existing test gate, after their ordinary disposable database
migration setup. Turbo passes only the test target and hosted-CI indicators to
tests. CI workflow files, deployment behavior, runtime configuration and migrations
are unchanged.

Review checklist:

- Confirm both hotel room totals and the five-floor Lincoln layout.
- Inspect the role matrix and the five enabled modules.
- Review seed collision/refusal behavior and the private credential workflow.
- Require the exact feature SHA's Fast DEV and Full Release results.
- Keep **LIVE DEV SEED NOT EXECUTED** until a separate execution package.
