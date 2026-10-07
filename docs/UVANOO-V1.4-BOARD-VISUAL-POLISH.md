# Board visual polish candidate — 7 October 2026

Original visual base: `0aee334c4201d7999c6bd50685a51bcca48bb91a`.
Publication parent: `f828482e819217c8e7ac2509e01c89db572e002b`.
The validated worker test-isolation correction is incorporated by fast-forward;
all 45 visual file hashes matched the recovery backup after incorporation.
There were no conflicts. The entire `packages/db` tree is unchanged from the
original visual base, including the Cycas seed implementation.
Branch: `feature/uvanoo-v1.4-board-visual-polish`.
Board: 15 October 2026. Feature freeze: 12 October 2026.

This is a presentation candidate for controller review. It does not seed, deploy,
or establish visual acceptance. On 7 October, Antonio authorized integration into
`feature/uvanoo-v1.4` only after local validation and strict head/scope checks pass,
followed by recording CI run IDs without waiting for CI completion. The working
checkout is an independent Git clone; the Cycas worker's mutable checkout is not reused.

## Read-only inventory and resulting scope

| Surface / route                                  | Finding at base                                                                                              | Change in this batch                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Authenticated AppShell                           | Tenant, role, property and search compete in one desktop row; separate duplicate property controls on mobile | One responsive role/property context row, taller top header                                        |
| Sidebar / navigation                             | Existing navy shell and permission-filtered groups; teal active fill                                         | Wider expanded rail, better logo spacing, restrained Terra active marker; registry unchanged       |
| Property context / breadcrumbs                   | Long hotel names and underlined breadcrumb chain                                                             | More legible selector, bounded popover, quieter wrapping breadcrumb trail                          |
| Dashboard                                        | Real role-filtered widgets, compact greeting, decorative gradient card                                       | Framed greeting, common widget surfaces, solid semantic tones; no metrics added                    |
| Properties                                       | Functional search and paging; plain name/code cards                                                          | Hotel icon and clearer title/code hierarchy on shared interactive surfaces                         |
| Property → Building → Floor → Room               | Existing Structure tab and authorized breadcrumb path; inconsistent bare borders                             | Shared record cards and form panels through all four levels                                        |
| People                                           | Search/status filters, mobile cards and raw sortable table; legacy empty panel                               | Shared header/empty state, grouped filter toolbar, consistent table spacing                        |
| Maintenance queue                                | Reference, title, priority, status and location visually mixed                                               | Reference and problem hierarchy; separate labelled priority/status badges; clearer hotel/room line |
| FOH quick report                                 | Full-width form; single property hidden                                                                      | Focused-width form, visible single-hotel context, spaced labels, clear submit action               |
| Compliance                                       | Shared list shell, KPI tiles and tables already enforce module access                                        | Consistent header/table primitives and clearer KPI typography                                      |
| Assets / equipment                               | Mobile cards and raw sortable desktop table                                                                  | Shared surfaces and aligned spacious rows; existing site, holder and status retained               |
| PPM / equipment maintenance                      | Existing calendar, dates and due-work panels                                                                 | Shared Card, headers, toolbar, buttons and badges inherit polish; layout logic unchanged           |
| Reports                                          | Searchable catalogue, nested bordered table, existing runtime filter panel                                   | Single table surface, shared empty state, consistent runtime filter panel                          |
| Diary / Tasks                                    | Bare bordered record, schedule and task panels                                                               | Shared surfaces on records and forms; task actions unchanged                                       |
| Manager sign-off                                 | Plain totals and confirmation/history panels                                                                 | Shared panel presentation; calculation and confirmation unchanged                                  |
| Inspections / Incidents / Training / Contractors | Use shared shell and UI primitives                                                                           | Shared improvements only; no bespoke redesign                                                      |

## Shared implementation

`packages/ui`: PageHeader, DetailHeader, Card, Table, EmptyState, Button, Badge,
and the explicit `.uv-surface` / `.uv-record-link` component classes in styles.css.
The classes use the existing light/dark design tokens. They do not target all
HTML elements or introduce a competing palette.

Web shell: AppShell, AppSidebar, SidebarNav, HospitalityPropertySwitcher,
PropertyBreadcrumbs, page-layout wrappers, TableToolbar, and ListCard.
The affected user-guide articles and English, Spanish and French catalogue
entries are updated together. Existing walkthrough targets remain intact.

Before: compact titles truncated on phones, hidden descriptions, inconsistent
plain bordered operational records and decorative empty-state gradients.
After: wrapping titles/actions, readable context, common white/neutral surfaces,
navy navigation, and limited Terra accents. Semantic priority/status colours keep
explicit text labels. The maintenance room label no longer duplicates “Room” when
the stored room name already includes it.

## Preserved behaviour

- Dynamic Platform Admin branding and tenant theme values.
- Existing links, navigation grouping, active-route matching, sidebar collapse
  preference, mobile drawer, and walkthrough attributes.
- All request-context, tenant-isolation, RBAC, property-scope and entitlement gates.
- All queries, mutations, form field names, validation requirements and actions.
- Maintenance source, assignment/work-order lifecycle, evidence and resolution rules.
- Compliance obligation evaluation, due dates and entitlement enforcement.
- Search, filters, sorting, pagination, exports and action visibility.
- Dashboard data sources, widget visibility and user-customised layouts.
- Cycas dataset implementation, DB schema, infrastructure and deployment governance.

No Kiosk route, menu item or UI has been introduced. No live database was used.

## Responsive evidence and limits

Source review covers desktop, tablet and phone breakpoints: desktop-only navy
sidebar with existing mobile drawer; one wrapping property/role context row;
wrapping page titles/actions; horizontal table scrolling; existing mobile People
and Assets cards; full-width phone submission and bounded FOH form width.

Tests exercise shared-shell context/control multiplicity and elevated-context
visibility, plus real FOH controls and submitted property/room/source/priority.
Existing navigation, hierarchy, property-scope and entitlement regressions are run.
These are component and functional tests, not proof of pixel layout at a viewport.

A static shell fixture was rendered with the actual compiled application CSS in
a temporary validation directory. Browser capture could not complete: the
computer-use browser transport first returned `Transport closed`. On recovery,
the browser inventory was empty and opening the in-app browser returned
`Browser is not available: iab`. There are no claimed
Dashboard/Properties/People/Maintenance/Compliance/Assets/Reports screenshots and
no claimed live visual acceptance. Controller review must still check populated
pages at desktop, tablet and phone sizes after authorised integration.

## Deliberately deferred Board gaps

- The People directory data contract does not supply property assignments or
  authorization roles to its rows. Existing job-title/status information is
  preserved; access roles are not inferred from job titles.
- The Maintenance queue does not load assignee display names. Assignment remains
  visible on the existing issue detail page; this batch does not broaden queries.
- Dashboard metrics remain the existing real operational/safety metrics. Hotel
  occupancy, ADR, RevPAR and P&L need their future authorised data integration.
- No new report filter dimensions or fabricated portfolio metrics were added.
- Full populated-route screenshots, contrast/overflow checks at actual viewports,
  and Antonio's visual acceptance remain outstanding.

## Validation

- Full workspace tests: PASS, 23/23 tasks, 2,539 tests passed and 2 skipped.
  Includes 1,516 web tests, 96 worker tests, 312 database-package unit tests,
  57 Compliance tests, 18 PDF tests, and the new shell/FOH tests.
- Skipped tests: `packages/auth/src/cycas-board.integration.test.ts` and
  `apps/web/src/lib/property-delegation.integration.test.ts`. No isolated test
  database was supplied; no DEV or live database was accessed.
- Navigation, tenant/module entitlements, property context/scope, Maintenance,
  Compliance and FOH regression suites pass within the full workspace run.
- Previous full typecheck: PASS, 25/25 tasks, with a 4 GB Node heap.
  The final recovery rerun was not started because its prerequisite
  production build failed.
- Full lint: PASS, zero errors and five pre-existing warnings. The subsequent
  changed-file lint pass was clean; the final Reports test-mock delta also
  passed its targeted lint check.
- Formatting: PASS, full repository check after recovery; the final report
  amendment is formatted and checked separately.
- Production build: BLOCKED by runner memory. A 4 GB heap exhausted V8 memory;
  the repository-prescribed 8 GB heap retry was terminated with SIGKILL and the
  validation session recorded an OOM kill. A final bounded 5 GB heap attempt
  exhausted V8 memory at approximately 5,033 MB after 7m53s. No compiler/source
  error was reported before these failures. No further VPS build retry is queued.
  No source, infrastructure, workflow, service or security setting was altered.
  The existing secondary execution workspace could run commands but could not
  resolve github.com, so it could not provide a viable validation fallback.
- `git diff --check`: PASS. All 44 source/test/catalogue files still match their
  original recovered hashes; only this handoff report changed during recovery.

Validation logs are retained beside the isolated checkout under
`/home/ubuntu/visual-polish-*.log`. The test run used the repository-pinned
headless browser with libraries and fonts extracted into isolated validation
folders; no system packages or services were changed. Turbo's loose environment
mode passed those test-only browser settings through. Live database/Redis
connection variables were explicitly unset.

Fast DEV and Full Release CI results for the parent do not validate the visual
commit. Both workflows trigger on an authorized feature-branch push; the isolated
visual branch does not trigger them. No visual commit was created or pushed, and no feature integration occurred:
the required production-build gate is not green. No CI runs were triggered for
this unpublished visual work. The isolated branch remains at the incorporated
parent SHA with all 45 changes preserved. CI completion and populated viewport
acceptance remain separate release gates.

## File manifest

45 files in the visual commit, relative to the publication parent. The inherited
worker test-only commit is not counted as a visual modification.

- `apps/web/src/app/(app)/compliance/page.tsx`
- `apps/web/src/app/(app)/dashboard/_dashboard-header.tsx`
- `apps/web/src/app/(app)/dashboard/_widget-views.tsx`
- `apps/web/src/app/(app)/equipment/_records-table.tsx`
- `apps/web/src/app/(app)/hospitality/maintenance/page.tsx`
- `apps/web/src/app/(app)/hospitality/maintenance/report/page.tsx`
- `apps/web/src/app/(app)/hospitality/maintenance/report/quick-maintenance-form.test.tsx`
- `apps/web/src/app/(app)/hospitality/maintenance/report/quick-maintenance-form.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/floors/[floorId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/floors/[floorId]/rooms/[roomId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/buildings/[buildingId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/diary/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/diary/tasks/[occurrenceId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/diary/templates/[scheduleId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/signoff/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/page.tsx`
- `apps/web/src/app/(app)/people/_records-table.tsx`
- `apps/web/src/app/(app)/people/page.tsx`
- `apps/web/src/app/(app)/reports/_viewer/viewer.client.tsx`
- `apps/web/src/app/(app)/reports/page.tsx`
- `apps/web/src/components/app-shell.test.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/hospitality-property-switcher.tsx`
- `apps/web/src/components/hospitality/property-breadcrumbs.tsx`
- `apps/web/src/components/list-card.tsx`
- `apps/web/src/components/page-layout.tsx`
- `apps/web/src/components/sidebar-nav.tsx`
- `apps/web/src/components/table-toolbar.tsx`
- `apps/web/src/lib/manual/content/getting-started.ts`
- `apps/web/src/lib/manual/content/hospitality.ts`
- `apps/web/src/lib/manual/content/oversight-admin.ts`
- `apps/web/src/lib/operations-report-page.test.tsx`
- `docs/UVANOO-V1.4-BOARD-VISUAL-POLISH.md`
- `packages/i18n/src/messages/en.json`
- `packages/i18n/src/messages/es.json`
- `packages/i18n/src/messages/fr.json`
- `packages/ui/src/badge.tsx`
- `packages/ui/src/button.tsx`
- `packages/ui/src/card.tsx`
- `packages/ui/src/empty-state.tsx`
- `packages/ui/src/page-header.tsx`
- `packages/ui/src/styles.css`
- `packages/ui/src/table.tsx`
