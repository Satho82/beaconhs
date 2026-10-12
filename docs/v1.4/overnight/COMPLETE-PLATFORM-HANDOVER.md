# Complete Platform Build handover — planning only

## Authoritative inventory and design

Recovered all 18 approved application groups from `apps/web/src/lib/nav/approved-structure.ts` at 563fb0e9b79a838a5f394abaffb2f7dc743fc571, Git blob bb250f1f187d13a27f781007b9e3633746c9456b. Preserve their exact order and names; groups without implemented destinations must not become dead links.

1. Dashboard
2. Daily Hotel
3. Diary & Tasks
4. Maintenance
5. Compliance
6. Risk
7. Inspections
8. Incidents
9. Action Plans
10. Training
11. People
12. Handover
13. Assets & PPM
14. Metering
15. Reporting
16. Reports
17. Approvals
18. Tenant Settings

Reporting and Reports are separate entries in the approved ledger. Reuse their compatible engines; do not silently rename or merge approved navigation. Unified Operations is an implementation/service boundary across Daily Hotel, Diary & Tasks, Inspections and Handover, not permission to invent a replacement menu tonight.

Preserve Light/Terra: light sidebar/cards, navy text/icons, teal and coral branding, coral active states, approved spacing/forms/tables/buttons, responsive expandable navigation and runtime tenant/platform branding. No gold substitution, dark redesign, alternate mock-up or fabricated visual pass. Reuse AppShell, page-layout, SidebarNav, packages/ui and the existing token definitions. Original versioned reference directory: `docs/v1.4/batch01/visual-checkpoint/references/`. It contains Approvals and shell/platform/tenant references; no People-specific original was found there.

## Coordinated implementation sequence

| Workstream | Groups / scope | Reuse and acceptance contract |
| --- | --- | --- |
| Shared foundation | All 18, Tenant Settings | Preserve tenant/property context, same-assignment RBAC, entitlements, audit, provenance, i18n, branding, search/filter/pagination. Inventory real vs incomplete controls before implementing. |
| Operations | Daily Hotel, Diary & Tasks, Inspections, Handover | One coordinated task/occurrence/checklist/schedule/sign-off/evidence model; reuse forms, inspections, hospitality diary, handover and shared Actions. Preserve recurrence candidates as separate evidence until reviewed/integrated. No duplicated task engines. |
| Maintenance | Maintenance, Action Plans | One consolidated issue/work-order lifecycle, staff and guest QR intake, assignment, evidence, reminders, escalation, status history, exports; links to Operations, Assets and Compliance. |
| Assets and PPM | Assets & PPM, Inspections, Maintenance | Asset hierarchy/QR, maintenance history, recurring PPM/checks, reminders, Excel/CSV mass import with preview/validation/idempotency/error report and audit. Reuse equipment/import/jobs engines. |
| Governance | Compliance, Risk, Incidents, Training | Preserve Risk unchanged. Reuse compliance registry/obligations, inspection/form evidence, incident workflow, training assignments and shared corrective Actions. Validate cross-property evidence/export isolation. |
| People and Approvals | People, Approvals | Accepted 12 October; preserve candidate runtime and freeze evidence. Cross-module identity/provenance, property authority, financial limits, immutable workflow versions and audit remain mandatory. |
| Metering and reporting | Metering, Reporting, Reports, Dashboard | Consumptions in units and currency, tariff/version provenance, date/property filters and exports. Reuse current chart/report/scheduled-report engines; PMS/occupancy/revenue adapter remains an explicit integration dependency, never fabricated data. |
| Platform administration | Platform shell outside the 18 application groups | Super Admin-only visual QR maintenance-reporting editor under Branding Management. Separate preview/save/publish, version/audit, input/upload security, safe public rendering and actual runtime branding. Tenant users must not acquire this capability. |

## Delivery gates and ownership

Use one integration controller for migrations/journal, RBAC/RLS, navigation, shared UI, events/jobs and deployment files. Module work can be divided in a later authorized phase, but shared-file changes land through that controller. Reserve new migration identities only after immutable 0063; never rewrite applied SQL.

For each coordinated batch: recover existing implementation and mock-ups; map requirements to real routes/engines; prepare one dependency-aware design; implement complete vertical flows; verify tenant/property isolation, permissions, audit, mobile usability and exports; update manual/tours; use disposable services; preserve exact source/tree/test evidence; perform combined release gates only after shared implementation changes. No placeholders, duplicate engines, dead controls, false completion or autonomous governed merge.

Use two synthetic hotels, One Fifty Fenchurch and The Lincoln Suites, with the six approved personas. Keep synthetic and persistent operational data strictly separate. Definition of done includes backend correctness, real authenticated browser flows, approved visual comparison, retry/idempotency, notification delivery, access revocation and recovery evidence.

## Tonight's boundary

No new module development, mock-up redesign, runtime changes or deployment was started. This is a coordinated future implementation handover, not a claim that the remaining modules are complete. Module-level existing readiness requires an implementation audit; older failures and separate recurrence branches are not silently treated as merged.
