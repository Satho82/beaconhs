# V1.2 property-authorization release acceptance

Status: release blocked pending the complete platform-wide reporting audit.
This is not deployment approval or a claim that reporting is green.

## Shared contract

Roles define operations; generic property assignments define hotel ownership.
Reporting scope is current global property context intersected with current
authorised assignments. Portfolio means assigned properties, never all tenant
properties by implication. No customer-specific authorisation or second selector.

## K0 validation completed on the isolated VPS database

- Shared assignment writer validates active properties against the target tenant.
- Existing role assignments have prefilled scope editing.
- Delegation checks both the proposed authority and the target's current authority.
- Cross-tenant, mixed-property, forged-ID and privilege escalation requests fail.
- Removed assignments disappear on subsequent requests, including impersonation.
- Rollback-only database fixtures pass for delegation, Actions, Incidents,
  Maintenance, Handover, Metering, Inspections and Compliance.
- Inspection/Compliance parent and child policies use the existing request scope.
- Evidence downloads recheck current access to every linked parent.
- Existing 49 migration SQL files are unchanged; no new migration is required.
- Existing stash and live staging data remain untouched.

Cloud CI, final image security verification and staging deployment are separate
release gates. Local validation does not substitute for them.

## Reporting findings that must be closed before deployment

1. Interactive report execution and dashboard loaders must explicitly consume
   the global property context, including direct server actions and exports.
2. Dashboard result-cache namespaces currently include roles/apps but not the
   assigned-property set or active property. Add current-authority isolation and
   prove removal does not reuse previously broader cached results.
3. Dynamic analytics source discovery must not treat tenant RLS alone as proof
   of property isolation. Certify every exposed source and joined source, or
   fail closed where property ownership cannot be demonstrated.
4. Scheduled execution must retain the chosen property context and intersect it
   with current run-as assignments. Protect schedule configuration and run IDs.
5. Scheduled emails currently include PDF bytes and seven-day object URLs.
   Future report access must use authenticated current-authority checks; do not
   distribute revocation-bypassing copies/URLs as the protected download path.
6. Cached report/PDF downloads must enforce both selected context and current
   assignments. Cross-tenant, forged-ID and direct-endpoint attempts must fail.
7. Property-owned compliance materialisation must not include another hotel's
   audience or evidence merely because a background scan runs tenant-wide.
8. The management dashboard needs supported Risk, Compliance, Actions,
   Maintenance, Incidents, Handover and Metering summaries plus authorised
   property comparison/drill-down. Never invent unavailable history or KPIs.

## Mandatory reporting proof

- A1+A2+A3 principal: portfolio totals include exactly those properties.
- A1+A3 principal: A2 is absent from rows, counts, charts, CSV and PDF.
- A2-only principal: only A2 contributes.
- Individual property selection narrows every reporting surface.
- Forged A2 request by A1 principal and cross-tenant report/export are denied.
- Removing A3 changes subsequent queries, caches, scheduled runs and downloads
  to the remaining authorised scope; historical records stay intact.
- Same-role users with different assignments cannot share broader cached data.
- Execute database-backed aggregate tests, not only UI/source contract checks.

## Release sequence

Complete and remotely verify K0; finish reporting/integration remediation in
coherent tested checkpoints; require exact-final-SHA GitHub CI; build and
independently scan the immutable private image; back up staging and prepare exact
rollback; deploy only staging; configure the existing Cluster GM through the
generic writer; reconcile existing data and run role/module smoke tests.
Production and portal are outside the authorised deployment scope.
