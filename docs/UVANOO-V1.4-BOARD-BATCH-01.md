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
