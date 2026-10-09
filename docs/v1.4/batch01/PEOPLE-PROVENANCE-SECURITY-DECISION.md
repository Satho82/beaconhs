# People provenance security decision

Status: implemented in isolated Batch 01; publication requires all technical gates.
This supersedes the earlier trust-boundary stop recorded at
`bccd99379791cae0c1a23940dca37d1ca0dbe7b7`. The user explicitly authorised the
trusted-read correction and disposable validation on 9 October 2026. Deployment,
live data, infrastructure, credentials, merging and DEV remain outside this work.

## Defect and preserved semantics

The original rollback-only regression remains: a hotel-assigned Person must be
hidden in legacy scope even when RLS hides every assignment. A truly unassigned
Person must remain visible. Runtime negative-existence queries cannot distinguish
these cases. `people.metadata` is writable and cannot supply trusted provenance.

Assignments remain authoritative, with tenant-qualified foreign keys and inclusive
`CURRENT_DATE` effective dates. No cache, backfill, Person-column rewrite, new login
or background job is introduced. Non-property sites require absent property
metadata; present but empty, null, malformed, foreign, missing and deleted property
mappings do not qualify as legacy. Mixed hotel/non-property assignments deny legacy.
Property scope retains its union of currently assigned active authorised properties.
Tenant-wide reads retain their tenant boundary.

## Trusted-read boundary

Migration 0057 installs one callable boolean function:
`security.person_allows_scope(uuid, uuid)`. Its only inputs are the row's tenant
and Person IDs. It validates the tenant against the transaction context and reads
scope/property settings from that context. It neither changes those settings nor
returns property IDs, assignments or arbitrary query results. The outer People
policy independently retains tenant equality. Application authentication and
permission checks remain responsible for establishing the trusted GUC context;
custom GUCs are not an authentication boundary against arbitrary SQL access.

The function is owned by the existing application migration owner, preflighted as
NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB and NOREPLICATION. This
owner already controls application DDL; runtime must not be its member. This choice
avoids a new cluster role and out-of-scope infrastructure provisioning. It does not
claim that a table-owning role has only column-level privileges: the existing DDL
owner remains trusted. The callable authority added for runtime is limited to this
fixed boolean query. A dedicated column-read-only role would narrow definer-owner
privileges further but requires independently governed cluster provisioning.

Two owner-only SELECT policies provide complete **same-tenant** assignment and
org-unit provenance. They have explicit tenant equality, not `USING (true)`.
`FORCE ROW LEVEL SECURITY` stays enabled. The function sets `row_security=on`, uses
`search_path=pg_catalog, pg_temp`, fully qualifies all application tables, and has no
dynamic SQL. PUBLIC execution is revoked transactionally; the runtime installer
grants only schema USAGE and execution on this exact signature. It denies schema
CREATE. The locking trigger is SECURITY INVOKER and uses the caller's RLS for
post-lock write checks. It has no public or runtime direct execution grant. No
runtime table visibility or membership is broadened.

## Concurrency contract

All assignment, org-unit and property INSERT/UPDATE/DELETE operations acquire the
same database-local, tenant-keyed transaction advisory lock before changing a row.
The trigger locks both old and new tenant identities in sorted order. Cascaded
deletes also invoke it. Runtime has neither TRUNCATE nor trigger-disabling rights.
Trusted owners can change DDL and are outside the runtime attacker model.

Restricted People access takes this lock before reading complete provenance in a
VOLATILE function. At READ COMMITTED, the subsequent SQL command obtains a fresh
snapshot. If the writer arrives first, the reader waits for commit or rollback and
then checks the resulting provenance. If the reader arrives first, the writer
waits for the reader's transaction to end. This also protects Person UPDATE/DELETE
and SELECT FOR UPDATE from mixing new row contents with stale authorisation.
Direct restricted assignment writers recheck both old and new site visibility
and both Person identities after waiting, using a fresh snapshot. A reproduced
assignment INSERT could previously claim a hidden Person by linking it to the
writer's visible property; INSERT and Person-reassignment regressions now require
`42501`, while authorised assignment creation, reassignment and deletion still
work. Site and assignment policies also require positive object metadata with an
absent property key for legacy access, preventing malformed mappings from exposing
or allowing deletion of otherwise hidden provenance. A reproduced adversarial DELETE originally
erased hotel provenance after a concurrent site remapping; the retained regression
now requires `42501`. Site writes similarly recheck current visibility and active
property provenance. Foreign-key cascades inherit the already-authorised parent's
mutation under the same lock; the site may already be absent during its cascade.
Both legacy and property decisions use this protocol; merely repairing the legacy
negative lookup would leave property reassignment vulnerable to a stale snapshot.

REPEATABLE READ and SERIALIZABLE do not refresh their snapshots after such a wait.
Restricted People access therefore raises `0A000` in those modes instead of claiming
that a VOLATILE function fixes them. Existing application transaction paths use
READ COMMITTED. Date semantics remain PostgreSQL transaction `CURRENT_DATE`;
there is no assertion that an already-open transaction changes date at midnight.

The coarse tenant lock intentionally favours a small auditable correctness
boundary. It serializes restricted People readers and provenance writers within a
tenant until transaction end. Different tenants proceed independently (a hash
collision can add contention but cannot grant access). Multi-row operations or
other row-lock ordering can deadlock; PostgreSQL aborts one transaction, preserving
security. Callers should keep transactions short and retry the entire transaction
when appropriate. This is not a claim of global serializability or a throughput
benchmark.

## Migration, failure and recovery

The additive migration verifies role/schema/function ownership before installing
objects. Drizzle installs it transactionally, then the existing atomic RLS installer
switches People to the resolver. Runtime execution grants follow. Any intermediate
missing execution privilege denies access rather than exposing rows. Re-running
the installer preserves the dedicated owner-read policies and trigger definitions.

Tests cover a fresh database, a populated pre-0057 database, repeated migration
installation, and rollback of the entire additive DDL transaction. No stored row
rewrite is required. A rollback after activation must not restore the vulnerable
People predicate: retain the security objects or disable restricted People access
until a reviewed forward repair. Any deployed rollback is separately authorised.

## Validation and isolation evidence

Local tests use `uvanoo-b01-provenance-20261009-a1202e`, created for this task with
Docker networking disabled, PostgreSQL TCP listeners disabled, tmpfs data storage,
and a newly created task-specific Unix socket directory. No persistent data volume
or existing Docker network is attached. A temporary host proxy binds only
`127.0.0.1:55449` and forwards only to that socket. The container has loopback only,
no network route and no path to DEV databases. All credentials and rows are
disposable fixtures. Existing containers and services are not reused or modified.

The original SQL assertions are retained. The explicit integration command
`pnpm --filter @beaconhs/db test:people-provenance` requires an opt-in flag and a
validated fixture database URL; it never falls back to application connection
settings. It tests all scope modes, effective dates, mixed assignments, malformed
provenance, Training/PPE dependants, DML denials, role/schema/function/trigger attacks,
same-transaction cascades and independently connected reader/writer sessions.
Concurrency cases inspect PostgreSQL's actual advisory-lock wait state before
releasing the writer or reader; timing alone does not establish serialization.

The validation-only workflow runs this suite and all six related rollback-only
Action/Incident/Handover/Metering/Maintenance/Inspection suites alongside the full
quality gates and production build. Publication uses a separate workflow commit
pinning the immutable product SHA. Run results and final SHAs are reported after
those gates complete. Visual acceptance remains separate and uses the nine
user-approved originals, with the Approvals image's light application sidebar
superseding earlier dark application navigation. No replacement mock-ups.

Primary semantics references:

- https://www.postgresql.org/docs/16/ddl-rowsecurity.html
- https://www.postgresql.org/docs/16/xfunc-volatility.html
- https://www.postgresql.org/docs/16/sql-createfunction.html
