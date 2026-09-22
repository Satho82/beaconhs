# G0 — Corrective Action property authorization

## Security contract

Action permissions and property assignments are independent boundaries.
`ca.read.all` grants the Action read tier within the caller's authorised
properties. Only a resolved tenant scope or platform administrator receives
tenant-wide Action visibility. The Global Property Switcher grants no authority.

Every authenticated `makeTenantContext().db()` transaction records resolved
scope in transaction-local PostgreSQL settings. Tenant RLS remains mandatory.
Additional Action policies apply to SELECT, INSERT, UPDATE and DELETE, including
queries that bypass the web list helpers. Trusted system `withTenant` callers
remain explicitly tenant-scoped; user-originated scheduled report execution
uses its freshly resolved run-as request context.

## Provenance

The shared policy derives property ownership from the authoritative source:

| Source                                                      | Property evidence                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Risk hazard                                                 | Hazard → assessment → property                                           |
| Operational occurrence                                      | Occurrence → schedule → property                                         |
| Inspection / equipment inspection                           | Source metadata and source location                                      |
| Incident / form response / HAZID / journal / PPE inspection | Source location's hospitality property                                   |
| Maintenance issue                                           | Issue → room → floor → building → property                               |
| Compliance obligation                                       | Obligation target property                                               |
| Standalone Action                                           | Explicit property metadata, checked against tenant property and location |

Unknown, missing, foreign-tenant and conflicting provenance fails closed for
property-limited users. A submitted property hint cannot override a linked
source. New source modules must extend this single resolver and its tests;
Handover does not yet participate and must not create a bypass.

Existing non-property source records retain legacy site/self Action permission
rules. A legacy role receives no property-bound Actions. Tenant/platform roles
remain tenant-bounded and may diagnose unresolved historical records.

Assignees of property-bound Actions must be active tenant members with a matching
property assignment or explicit tenant scope. Other Action permissions, locking,
verification and audit requirements remain in place.

## Reviewed surfaces

- Lists, detail, search, picker options, related/finding retrieval, personal tasks,
  dashboard metrics, summaries and counts execute under the scoped transaction.
- Create, update, bulk reassignment, status, verification, close/reopen and evidence
  operations receive the same RLS read and write predicates.
- Risk, Diary, Inspection, Incident, Compliance and Maintenance source mappings
  share the resolver; unresolved links are not treated as tenant-wide.
- CSV and live PDF requests retain their existing permissions. The Action report
  view uses security-invoker semantics.
- Scheduled reports execute through their current run-as context, including role
  narrowing. New persisted PDF artifacts record that output scope. Cached output
  must remain within current scope before reuse or delivery.
- Report-run and delivery queries are scoped. Old stored PDFs without verifiable
  output-scope metadata are hidden from restricted users; a newly authorised run
  is required. No old artifact is deleted or silently reclassified.
- Generic attachment capabilities still require tenant authentication. A bounded,
  tenant-filtered privileged lookup discovers Action/signature/report parent IDs;
  every parent must then be visible through the caller's ordinary scoped
  transaction. It never returns parent content from the privileged lookup.
- Action and report audit history follows the parent record. Bulk Action export
  summaries have no parent ID, so they record the resolved output scope and are
  visible only within that scope (or to an explicit tenant/platform principal).

## Database installation

No historical migration SQL or journal entry changes. No table or physical
column is added. The existing migration runner always reinstalls RLS and report
views, even when there are no pending numbered migrations. That installer is
required during a separately approved deployment. The optional report output
authorization stamp uses existing request-snapshot JSON without altering the
captured request fields.

No policy installation or deployment has been performed against staging or
production by this checkpoint.

## Validation

The rollback-only PostgreSQL suite is emitted with:

```sh
pnpm --silent --filter @beaconhs/db run test:action-property-sql
```

Pipe that output only into a disposable database after the full migration history,
RLS installer and report views. The suite uses a non-superuser role and checks
single-property/Cluster reads, query filtering, report counts, cross-tenant
isolation, forged property provenance, mutation denial, assignee restrictions,
completion/evidence/audit visibility, and cached-export scope changes. Fixtures,
grants and the test role roll back. CI runs the same suite after both normal and
idempotent migration passes.

The preserved Handover file belongs to the subsequent checkpoint and is excluded
from G0. Its original Git object hash is
`9d8e2ced6ea0055956bb8fcc6e10419f6bfb0971`.
