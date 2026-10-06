# V1.4 Board foundation — Batch 01

Baseline: `861d779ff8765fe641a1a418957a1e95a834e778` on
`feature/uvanoo-v1.4`. This is development implementation, not board candidate
acceptance or release approval.

## Delivered scope

| Area                   | Behavior                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared shell           | Navy navigation, neutral canvas, restrained Terra accent, existing teal actions and semantic status colors. Desktop navigation supports nested links and independent accessible disclosure controls. Mobile navigation reuses the shared focus-managed drawer. Property context is visible below the mobile header. |
| Platform overview      | Guarded repository counts for tenants, non-deleted properties, global user identities, five catalogue modules and non-deleted tenant form templates. Bounded tenant and activity summaries link into existing administration routes. No invented trends, revenue or infrastructure health.                          |
| Tenant portfolio       | Existing search, status filtering, sorting and pagination retained. Property counts, effective module counts and configuration links added.                                                                                                                                                                         |
| Platform tenant detail | Tenant identity and Platform scope accompany Overview, Modules, Branding, Properties and Activity tabs. Existing routes and mutation guards remain.                                                                                                                                                                 |
| Modules                | Configured and effective state, effective period, change metadata and existing edit mechanism. Diary dependency and incomplete Compliance enforcement are explicitly qualified. No new catalogue entries or enforcement changes.                                                                                    |
| Master branding        | Existing name, logo, favicon and primary color controls, masthead/login/title preview and corrected Platform back-navigation. No invented theme selector or independent title setting.                                                                                                                              |
| Tenant Settings        | General, Branding, Notifications and Integrations lead to distinct content. Advanced redirects to General. General saves no longer overwrite branding or dormant hierarchy values.                                                                                                                                  |
| Tenant Branding        | Shared form presentation with a separately guarded tenant-admin action. Authenticated tenant context determines the target; posted tenant/master fields cannot widen scope. Governed logo/PDF helpers, atomic audit/update, safe errors, upload cleanup and private same-tenant previews.                           |
| Board navigation       | Properties is the primary physical structure; Operations, Safety & Compliance, Assets, People, Reports and Administration group authorized destinations. Lift Plan, PPE and Tools are hidden from primary presentation without deleting saved preferences or data. Toolbox Talk remains available when authorized.  |
| Property journey       | Overview, Structure, Operations and manager-only Settings around existing Property → Building → Floor → Room records. Searchable, paginated building drilldown avoids loading a full room tree. Authorized import links explicitly say tenant-wide.                                                                 |
| Guidance               | Manual and walkthrough updates describe the implemented navigation and administration scopes.                                                                                                                                                                                                                       |

## Security and isolation

- Existing entitlement, RBAC, property-scope and action authorization remain
  authoritative. Navigation visibility does not grant access.
- Cross-tenant Platform reads retain Platform-operator guards. Tenant branding
  derives its tenant ID from authenticated context and limits privileged tenant
  metadata reads/writes to that ID.
- Tenant branding cannot change Platform product name, master logo, favicon or
  browser-title template. Tenant colors do not replace semantic status colors.
- No schema, RLS, UUID, physical relationship or database migration changes.
- No DEV, production, OVH, infrastructure, secret or deployment changes.
- Work Package A protected files, Fast DEV V1, Full Release, candidate verification
  and deployment workflows remain unchanged.

## Validation and remaining evidence

Local focused validation covers navigation, Platform and settings guard contracts,
branding action/asset isolation, property access, theme governance, form
failure/Discard behavior and nested navigation. Worker storage-init, Fast DEV and
candidate-deployment/repository-immutability contracts are also exercised.
TypeScript and formatting/lint checks apply to the changed web/shared UI code.
No production build or live database mutation is part of this batch.

The local runtime is Node 24.20.0; cloud CI retains the repository-pinned Node
24.18.0 and pnpm 10.30.3. Existing installed dependencies were reused read-only;
test caches remain inside the isolated checkout.

Responsive review checks shrinking header/context containers, wrapping actions,
scrollable tabs/tables and keyboard-accessible navigation. Browser execution was
denied by the session approval policy: **live desktop/tablet/390px screenshots and
authenticated end-to-end verification remain pending**. Unit tests are not a
substitute for that evidence.

Unsaved-change protection covers full unload and normal link navigation. Browser
history or programmatic context switches require additional end-to-end review.
Legacy external branding references are retained and honestly identified when a
governed preview is unavailable; uploading a replacement uses governed storage.

Maintenance uses the updated shared shell and existing operational table
primitives. Its table/service logic was deliberately left unchanged to preserve
Work Package A. Full physical migration, a separate Space register, People/Assets/
Compliance relationship migrations, Compliance enforcement repair and new
Approvals/PMS/billing capabilities remain outside this batch.

## Review checklist

- Open Platform Overview and verify displayed counts against known records.
- Search/filter tenants; open all five tenant tabs and check the selected scope.
- Check configured versus effective module state and Diary dependency.
- Exercise master branding and confirm its back link stays in Platform scope.
- In Tenant Settings, test Save, Discard, invalid uploads and failed saves; verify
  General does not change branding or dormant hierarchy values.
- Verify a tenant admin cannot read another tenant's branding assets or change
  master identity; verify unauthorized users cannot open settings actions.
- Browse Property → Building → Floor → Room; verify scoped access and import
  discovery. The import remains tenant-wide.
- Check keyboard drawer/disclosure behavior, long tenant/property names and
  primary actions at desktop, tablet and approximately 390px.
- Require exact-SHA Fast DEV success for development closure. Full Release remains
  mandatory for candidate acceptance, deployment and board candidate freeze.

**FAST DEV GREEN ≠ RELEASE APPROVED.**

## Fast DEV regression correction for 1587c2c5

The failed automatic Fast DEV run is
[37377952347](https://github.com/Satho82/beaconhs/actions/runs/37377952347).
It reported 1,441 passing, eight failing and one skipped web test. The runner,
installation, static checks and disposable database migrations worked.

| Failure                     | Cause and authoritative contract                                                                                                                                                                                         | Correction                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untranslated JSX/attributes | Board shell commit `43cb94ca` and administration/property commit `1587c2c5` added literal copy outside the existing translators, including the shared drawer fallback label. The i18n contract remains authoritative.    | Route new display copy, labels and accessibility text through existing server/client/UI translation helpers; catalogue the copy.                                                                                                                                                            |
| Programmatic copy           | New settings messages, leave-page confirmation, audit summary, tab/metric labels and guide/tour titles were absent from the catalogue. Existing runtime localisation remains authoritative.                              | Catalogue the new strings and translate settings messages, confirmation prompts and displayed system values.                                                                                                                                                                                |
| Request-aware metadata      | `1587c2c5` replaced translated Platform Overview metadata with a static English export.                                                                                                                                  | Restore request-aware `generateMetadata` using the server translator.                                                                                                                                                                                                                       |
| Manual/tour catalogue       | The Board commits changed branding, navigation guidance and tour text and added Board articles without corresponding catalogue entries. The coverage list also omitted the new article collection.                       | Update all three locale catalogues and add Board articles to the existing long-form coverage assertion. Existing English fallbacks for legacy guide bodies are retained.                                                                                                                    |
| Dynamic UUID route audit    | The new branding asset route uses `kind` as the finite `logo`/`letterhead` discriminator. The audit classified every unrecognised segment as UUID-backed. A UUID predicate would incorrectly reject both supported URLs. | Classify only this exact route/parameter as text-backed. Move the finite-value guard before request context and privileged reads. Runtime tests reject invalid, traversal, empty and UUID-shaped values before context/database/storage access. All actual UUID route checks remain intact. |
| Archive confirmation        | Approved Property tabs moved the existing archive form to manager-only Settings. The test still rendered default Overview.                                                                                               | Exercise Settings, retaining the confirmation name/value/destructive-variant and property-ID assertions; reader access remains denied.                                                                                                                                                      |
| Building count/page         | Approved Structure tab contains the existing pagination control. SQL-filter equality and limit/offset assertions already passed; only lookup of the control on default Overview failed.                                  | Exercise Structure, retaining identical tenant/property/name/code predicates, page bounds and pagination assertions.                                                                                                                                                                        |
| Search empty state          | The building empty state moved to Structure. The test still searched default Overview.                                                                                                                                   | Exercise Structure with the same zero-match title and absence-of-creation-prompt assertions; retain the property-list empty-state checks.                                                                                                                                                   |

No building-query, tenant-isolation, property-scope, entitlement or archive-action
contract is relaxed. No workflow, infrastructure, deployment or database schema
change is included. Property tabs and the approved Board presentation remain.

### Validation

- Requested focused suites: 21 tests passed across three files.
- Board regression set: 178 tests passed across 24 files (navigation, theme,
  Platform/tenant administration, branding actions/assets, settings Save/Discard,
  property access/actions/controls).
- Locale catalogue consistency: 12 tests passed across two files.
- Worker storage initialisation: two tests passed.
- Fast DEV classifier: 37 tests passed; Fast DEV, candidate deployment and
  repository-immutability shell contracts passed.
- Fresh Next.js route type generation and full web TypeScript check passed.
- Changed-file formatting and diff whitespace checks passed.
- Changed web files: ESLint passed with three existing image-element warnings.

### Publishing constraint

The unchanged `.github/workflows/uvanoo-v1.4-cloud-build.yml` automatically runs
Full Release validation on pushes to `feature/uvanoo-v1.4` touching `apps/**` or
`packages/**`. This correction necessarily matches those paths. Pushing cannot
currently trigger only Fast DEV. No push or manual workflow dispatch is performed
while the instruction not to run Full Release remains in force. Resolving this
constraint requires an explicit decision about that existing automatic trigger.

### Review checklist

- Confirm Settings still requires archive confirmation and hides it from readers.
- Check Structure search, matching counts, bounded pagination and no-results copy.
- Check translated Board labels, settings feedback, metadata and guide entries.
- Verify unsupported branding asset kinds fail before request-context access.
- Obtain automatic Fast DEV success for the eventual remote correction SHA before
  closing this development batch; do not treat local checks as release approval.

### Correction file manifest

- `apps/web/src/app/(app)/admin/integrations/page.tsx`
- `apps/web/src/app/(app)/admin/notifications/page.tsx`
- `apps/web/src/app/(app)/admin/settings/branding/assets/[kind]/route.test.ts`
- `apps/web/src/app/(app)/admin/settings/branding/assets/[kind]/route.ts`
- `apps/web/src/app/(app)/admin/settings/branding/page.tsx`
- `apps/web/src/app/(app)/admin/settings/page.tsx`
- `apps/web/src/app/(app)/admin/settings/settings-form.test.tsx`
- `apps/web/src/app/(app)/admin/settings/settings-form.tsx`
- `apps/web/src/app/(app)/hospitality/properties/[propertyId]/page.tsx`
- `apps/web/src/app/(app)/hospitality/properties/page.tsx`
- `apps/web/src/app/(platform)/platform/branding/page.tsx`
- `apps/web/src/app/(platform)/platform/page.tsx`
- `apps/web/src/app/(platform)/platform/tenants/[tenantId]/entitlements/page.tsx`
- `apps/web/src/app/(platform)/platform/tenants/page.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/mobile-nav-toggle.tsx`
- `apps/web/src/components/platform-tenant-tabs.tsx`
- `apps/web/src/components/sidebar-nav.test.tsx`
- `apps/web/src/components/sidebar-nav.tsx`
- `apps/web/src/components/tenant-branding-form.tsx`
- `apps/web/src/i18n/i18n-coverage.test.ts`
- `apps/web/src/lib/dynamic-uuid-route-guards.test.ts`
- `apps/web/src/lib/hospitality/properties-pages.test.tsx`
- `apps/web/src/lib/use-unsaved-changes.ts`
- `docs/UVANOO-V1.4-BOARD-BATCH-01.md`
- `packages/i18n/src/messages/en.json`
- `packages/i18n/src/messages/es.json`
- `packages/i18n/src/messages/fr.json`
- `packages/ui/src/drawer.tsx`
