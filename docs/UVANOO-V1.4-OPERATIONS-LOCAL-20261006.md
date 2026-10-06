# Uvanoo V1.4 Operations local Board batch — 6 October 2026

## Identity and integration boundary

- Repository: Satho82/beaconhs.
- Local development branch: feature/uvanoo-v1.4-operations-local-20261006.
- Starting local commit: 3cd836d77f46d948f5e991cd61f10473323eab95.
- Starting complete tree: e6d94af2278b8aa55217263c6641804c8fd68989.
- Published authority remains 789ec16357ab721e4222038e6b08f7a595edefd6.
- The two starting commits have the same parent and identical trees. The temporary branch does not contain the published baseline in its ancestry.
- No fetch or push attempted during this authorised local batch. The original local feature branch remains at 3cd836d77f46d948f5e991cd61f10473323eab95.

## Packages and evidence

| Package                    | Local implementation / review                                                                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Property hierarchy       | Building floor search and bounded pagination with one shared tenant/building/name/code predicate for list and count, deterministic ordering, search empty state, and hierarchy breadcrumbs on Property, Building, Floor and Room pages. Existing archive confirmation retained.                             |
| 2 Import discovery         | Existing Structure tab link already exposes the governed importer, truthfully labelled tenant-wide. Added permission regression coverage and help; no importer rewrite.                                                                                                                                     |
| 3 Maintenance              | Existing issue details now expose translated status/priority, real assignee, work update form, staged evidence, then saved resolution and record timestamps for readers. Queue identifies its actual Property context. Report action follows maintenance.create. No invented work stages or audit timeline. |
| 4 Compliance               | More suitable summary grid at tablet widths, accessible table name and numeric completion meters. Existing entitlement gap explicitly deferred, not silently fixed.                                                                                                                                         |
| 5 Assets/PPM               | Existing equipment maintenance list flows at phone/tablet widths; desktop retains calendar. Overdue records carry a text label beside the due date. Existing authorisation, location model and history retained.                                                                                            |
| 6 People                   | Filtered zero results no longer suggest creating a person; pagination remains available on empty pages. No Person-to-Property migration or importer executor.                                                                                                                                               |
| 7 Reports                  | Existing report library uses bounded integer page parsing, distinguishes filtered empty results, retains pagination, and has an accessible table/action-column label. Existing definitions and report authorisation retained.                                                                               |
| 8 Operational UX           | Existing PageContainer, PageHeader, SearchInput, Pagination, Badge and table primitives reused. No new global framework.                                                                                                                                                                                    |
| 9 Responsive/accessibility | Source review at approximately 390px, tablet and desktop breakpoints; wrapping hierarchy links/issue content, visible focus on new navigation, mobile PPM flow, labelled tables and completion values, explicit overdue text. No authenticated rendered viewport or contrast audit was performed.           |
| 10 I18n/help               | New copy and changed articles catalogued in English, French and Spanish. Updated Property, Maintenance, People, Reports, Compliance and Equipment help. Existing tour targets were not moved or renamed.                                                                                                    |

## Board readiness

These are local implementation findings, not a deployment or candidate acceptance.

| Surface     | Status                                                | Remaining qualification                                                                                                                                                           |
| ----------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Properties  | READY for integration                                 | Live responsive/visual acceptance still required.                                                                                                                                 |
| Import      | READY for integration                                 | Existing tenant-wide scope; importer execution unchanged.                                                                                                                         |
| Maintenance | READY for integration                                 | Existing issue workflow; record timestamps are not a full event timeline. Live walkthrough still required.                                                                        |
| Compliance  | BLOCKED for safe entitlement-controlled demonstration | BOARD BLOCKER — TENANT MODULE ENTITLEMENTS. Existing overview route checks compliance.read but does not assert a tenant module entitlement. No security architecture change made. |
| Assets/PPM  | PARTIAL                                               | Existing legacy physical-location model retained; no canonical Space migration claimed.                                                                                           |
| People      | PARTIAL                                               | Existing directory only; canonical Person-to-Property assignment and import execution remain deferred.                                                                            |
| Reports     | READY for integration                                 | Uses existing definitions and authorization; no new KPI or financial claims.                                                                                                      |

## Validation

- Focused Property/UUID/i18n suite: 62 tests passed across seven files.
- Maintenance Board detail/lifecycle/evidence/navigation: 14 tests passed across four files.
- Broader Operations regression suite: 238 tests passed across 31 files, covering hospitality, UUID guards, i18n, new People/Reports tests, Property scope/evidence, report security, module entitlements, equipment evidence and Property import.
- Locale package tests: 12 passed across two files.
- Full web TypeScript check (`tsc --noEmit`): passed, including the final test changes.
- Changed source ESLint, Prettier and `git diff --check`: passed.
- Final follow-up tests after strengthening the Property assignment fixture and reordering Maintenance sections: 14 passed across three files.
- Database-backed delegation integration, build, live browser and cloud validation not claimed.

## Security and ownership review

- Building UUIDs are validated before request-context/data access; entitlement, read permission and assigned-Property checks remain in place. Parent records must exist in the same tenant and hierarchy and remain active before querying children.
- Floor count and page share the exact same predicates; page size is bounded by the existing parser.
- Property archive confirmation and importer management permissions have passing regressions.
- Maintenance lifecycle services, actions, attachment URLs, upload path, evidence rules and Property predicate remain unchanged. Reader presentation does not introduce write controls.
- No schema, migrations, RLS, tenant policy, credentials, DEV/production infrastructure, workflows, global CSS/tokens, application shell, navigation registry or Admin/Branding changes.
- Shared integration requests: none needed for implementation. Catalogue/manual changes should be merged with any concurrent Board/Admin additions.
- FAST DEV BRANCH TRIGGER INTEGRATION REQUIRED: current workflow push trigger covers only feature/uvanoo-v1.4. It was neither modified nor manually dispatched. No Fast DEV green claim.

## Reconciliation after Git access returns

This is a later explicit integration step; do not push the sibling history over the remote Operations branch.

1. Re-read the authoritative remote Operations branch and inspect any changes since 789ec16357ab721e4222038e6b08f7a595edefd6.
2. Establish an isolated checkout of that branch, verifying ancestry from the authoritative baseline and a clean working tree.
3. Cherry-pick only the new Operations commits after 3cd836d77f46d948f5e991cd61f10473323eab95, in order. Do not cherry-pick the sibling baseline itself.
4. Resolve shared catalogue/manual conflicts without losing either lane's additions. If remote is unchanged, verify the resulting tree equals the final local Operations tree. If remote has advanced, review the combined diff and rerun applicable tests.
5. Publish only with a normal fast-forward push under the later integration authorisation. Never force-push. Central integration owns workflow branch-trigger changes and authoritative CI evidence.

## Changed files

- `apps/web/src/app/(app)/compliance/_shared.tsx`
- `apps/web/src/app/(app)/compliance/page.tsx`
- `apps/web/src/app/(app)/equipment/maintenance/page.tsx`
- `apps/web/src/app/(app)/hospitality/maintenance/[issueId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/maintenance/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/floors/[floorId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/floors/[floorId]/rooms/[roomId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/page.tsx`
- `apps/web/src/app/(app)/people/page.tsx`
- `apps/web/src/app/(app)/reports/page.tsx`
- `apps/web/src/components/hospitality/property-breadcrumbs.tsx`
- `apps/web/src/lib/hospitality/building-floors-page.test.tsx`
- `apps/web/src/lib/hospitality/maintenance-board-page.test.tsx`
- `apps/web/src/lib/hospitality/properties-pages.test.tsx`
- `apps/web/src/lib/manual/content/hospitality.ts`
- `apps/web/src/lib/manual/content/knowledge-assets.ts`
- `apps/web/src/lib/manual/content/oversight-admin.ts`
- `apps/web/src/lib/operations-people-page.test.tsx`
- `apps/web/src/lib/operations-report-page.test.tsx`
- `packages/i18n/src/messages/en.json`
- `packages/i18n/src/messages/es.json`
- `packages/i18n/src/messages/fr.json`
- `docs/UVANOO-V1.4-OPERATIONS-LOCAL-20261006.md`
