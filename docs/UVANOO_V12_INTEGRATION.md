# V1.2 final integration checkpoint

This checkpoint builds on Incident checkpoint `df539788db60f9937b12527d1b1e9ec454011b03`.
It does not change migration SQL, deploy services, or alter staging data.

## Integration changes

- Corrective Action lists, report aggregates, and CSV exports use the resolved
  Property Context to narrow the existing transaction-level property RLS.
- Incident CSV exports use the same selected-property boundary as the list.
- Portfolio retains the caller's permission-derived assignments; an active
  property can narrow access but cannot grant access to another hotel.
- Action, Incident, Handover, and Maintenance evidence linking checks every
  existing parent across all four modules. Shared annotation edits in Actions
  and Incidents apply the same check. Tenant image validation remains mandatory.
- The existing Corrective Action engine continues to own assignments, priority,
  due dates, evidence, verification, closure, and audit history. No parallel
  action system or source-provenance bypass is introduced.

## Feature reconciliation and regression coverage

| Area           | Existing implementation and automated coverage                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Property       | Resolved active/Portfolio context, server property guards, permission-derived request scope; property-context, property-access, and action-property-context tests                                                                               |
| Risk           | Standard Library, immutable adoption snapshots, multiple hazards, initial/residual scoring, lifecycle/reminders/sign-off/versioning, registers and branded PDF/CSV; risk-assessments, risk-lifecycle, risk-reporting, database and worker tests |
| Handover       | Chronological feed, shifts, acknowledgements, follow-up/carry-forward, evidence, Maintenance and shared Action links; handover contract and disposable RLS fixture                                                                              |
| Metering       | Single workspace, Overview/Entry/History/Analytics/manager Setup, serial/MPAN search, readings, tariff snapshots, consumption and expenditure; metering tests and disposable RLS fixture                                                        |
| Maintenance    | Staff and room-token guest evidence, before/after/completion stages; maintenance evidence/lifecycle/guest tests and disposable RLS fixture                                                                                                      |
| Incidents      | Operational reporting fields, property-scoped list/export/evidence, guarded lifecycle, audit and shared Action linkage; Incident tests and disposable RLS fixture                                                                               |
| Shared Actions | Risk/Handover/Maintenance/Incident/Inspection/Compliance provenance resolves through the existing G0 property predicate; Action RLS fixture, source-policy tests and compliance evidence lifecycle contract                                     |

The five rollback-only database fixtures cover Actions, Incidents, Handover,
Metering, and Maintenance evidence under non-bypass roles. They run only against
disposable databases, including in the V1.2 validation workflow. Existing migration
history remains 49 migrations; this checkpoint adds none.

The additional integration tests protect all seven affected list/report/export
entry points, all four evidence mutation integrations, selected-property scope,
empty/forged scope rejection, and denial when any shared parent is inaccessible.

## Release boundary

Automated tests and source reconciliation are not a claim of deployed UAT
success. Release still requires the exact pushed SHA's complete CI, a fresh
private image, independent archive vulnerability/secret checks, fresh staging
backups and rollback reference, normal forward migration, and the approved
staging role/module smoke tests. No production or portal deployment is authorized.
