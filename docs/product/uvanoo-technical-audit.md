# Uvanoo technical audit

**Audit date:** 2026-09-11  
**Repository state audited:** `main` at `5f1bdf327a0a5c62e8b9dc582c75b41ffbe26e61`  
**Scope:** read-only code audit. This document proposes a hospitality MVP; it does not approve or implement it.

## 1. Executive summary

BeaconHS is a substantial, pre-launch, multi-tenant H&S/compliance monorepo, not a greenfield foundation. Its strongest reusable capabilities are PostgreSQL RLS, role permissions, audit logging, evidence storage, form/inspection machinery, compliance materialization, notifications, background jobs, equipment QR tags and asset work orders. The seven-day Uvanoo MVP should add a thin, explicit hospitality domain and reuse those primitives.

The current product is construction-oriented. It has no property/building/floor/room model, room QR token, generic maintenance issue, operational-task scheduler, manager sign-off, module entitlement, contractor domain, or hospitality dashboard. The existing `org_units` hierarchy and `equipment_work_orders` are not safe substitutes for those missing concepts: the first only permits `customer/project/site/area`; the second requires an equipment item.

The recommended MVP vertical slice is: hospitality locations and room QR, a generic maintenance issue/work order targeted at a room or asset, recurrence-driven operational tasks, alerts/escalation, and immutable weekly/monthly sign-off. Fire/water/H&S should initially be delivered through configured inspection/form/compliance templates and task templates, not new specialist engines.

## 2. Current architecture

- pnpm 10/Turbo monorepo; Node 24, TypeScript strict. `apps/web` is Next.js 16 App Router; `apps/worker` is a BullMQ worker plus one-shot repeatable-job scheduler.
- Packages encapsulate database/Drizzle, tenant context, Better Auth, audit, forms, compliance, jobs, domain events, reports, storage, integrations and UI.
- Authentication is request-context based. Tenant data is queried through `ctx.db`, which runs a transaction with `app.tenant_id` set; production uses a separate `BYPASSRLS` pool for intentional super-admin access.
- The product uses server actions/routes, a shared UI kit, Redis/BullMQ, S3-compatible object storage, and a transactional domain-event outbox.

## 3. Current database and domain model

Drizzle schemas are in `packages/db/src/schema`; 38 migrations (`0000_init.sql` through `0037_platform_branding.sql`) are present. Migration runner installs RLS for the explicit `TENANT_SCOPED_TABLES` registry.

Existing domain coverage includes tenants/users/memberships/roles; configurable construction organisation units; people, departments, crews and assignments; generic forms; inspections; HazID/JSHA; incidents; corrective actions; equipment; PPE; training; documents; reports; notifications; attachments; integration logs and domain events.

The current hierarchy is self-referential `org_units` with enum levels `customer`, `project`, `site`, `area` (`packages/db/src/schema/org.ts`). It supports addresses, site geofences and equipment-base flags. `locations.ts` only contains customer contacts; it is not a separate room/location model.

## 4. Authentication, permissions and tenant isolation

- `packages/auth/src/server.ts` configures Better Auth with invite-only accounts, password sign-in/reset and magic-link login.
- `apps/web/src/lib/auth.ts` resolves memberships, active tenant, linked person, role permissions, scopes and super-admin state. `packages/tenant/src/index.ts` supplies wildcard/read-tier permission checks and `assertCan`.
- Tenant-owned tables have `tenant_id`, tenant-aware foreign keys in major newer domains, and FORCE RLS via `packages/db/src/rls.ts`. The super-admin pool is deliberately separate.
- RBAC is a catalogue plus role assignments/scopes and per-user grants/denies (`packages/db/src/schema/iam.ts`). Existing equipment, compliance, incident and corrective-action permissions are reusable patterns.

This is production-quality infrastructure, subject to the normal discipline of adding every new table to RLS, using tenant-aware FKs, enforcing permissions in server actions/routes, and testing cross-tenant denial.

## 5. Module and navigation architecture

`apps/web/src/lib/nav/registry.ts` is the canonical built-in module registry. `tenant_nav_config` stores tenant-specific ordering, labels, hiding and pinned forms; `resolve.ts` filters entries by permission. It is a presentation/customization system, **not** an entitlement/licensing system. Hiding an item neither blocks direct routes nor feature mutations.

Use separate customer-module entitlement records and server guards for Uvanoo. Navigation should consult entitlement only after it is authoritative; route/action/API authorization must enforce it independently.

## 6. Existing hospitality-relevant functionality

Production-ready/reusable foundations include:

- `inspections`, generic Apps/forms, signatures, photos and PDFs for fire, water hygiene, room checks and H&S checklists.
- `compliance_obligations`, audience, dispatch ledger and status materialization for recurring compliance evidence.
- incidents, corrective actions (ownership, verification, photos, completion steps), people/training, documents and reports.
- `attachments` with staging/finalization, private object keys, metadata/geolocation and annotation support.
- dashboards, report schedules, notification preferences, email/SMS/push queues, audit logs and domain-event outbox.

Do not rebuild these capabilities merely to use hospitality terminology. Add adapters, target references and hospitality UI around them.

## 7. QR, equipment and maintenance architecture

`equipment_items` has a globally unique `qr_token`, an asset register, custody/location history, inspection types/records/schedules/reminders and a station scan experience. `/equipment/scan/[qrToken]` resolves an equipment token then redirects to station workflow. This is asset QR, not public room issue reporting.

`equipment_work_orders` offers statuses from open through verified/closed, priority, reporting/assignment, action/cost and audit-capable UI. However `item_id` is required. `equipment_inspection_schedules` and `equipment_reminders` are asset-only cadences. They should remain asset-specific.

## 8. Compliance architecture

The unified compliance engine is mature: `compliance_obligations`, `compliance_audience`, `compliance_dispatches` and `compliance_status`; `packages/compliance` contains evidence/materialization logic and worker scans. Existing source modules include inspection, document, training, form, journal, equipment/PPE inspection, corrective action and hazard assessment.

There are generic inspection banks/types/criteria/records; HazID assessments with hazards, tasks, questions, signatures and photos; comprehensive incident investigation; corrective-action verification; and training courses/records/skills. These support a hospitality compliance foundation. Fire/legionella/COSHH/food safety-specific registers and legal-rule content do not exist.

## 9. Notifications, jobs and scheduling

BullMQ queues are centralized in `packages/jobs`; worker handlers and scanners live in `apps/worker/src`. Existing scheduled concerns include compliance, equipment maintenance, report cadence, escalation, form sessions, notifications, storage cleanup and sync. `apps/worker/src/scheduler.ts` persists repeatable jobs then exits. Notifications support in-app, email, SMS and push, category audiences and tenant preferences.

This is sufficient infrastructure for a task scheduler, but there is no generic task-template/occurrence/escalation state model. Do not repurpose report schedules or equipment reminders as the diary.

## 10. API, events and integrations

`/api/v1/[entity]` provides authenticated, rate-limited, tenant-scoped generic entity reads and selected idempotent writes, documented at `/api/v1/openapi.json`. API keys have permissions; report entity mapping drives much of the surface. No Uvanoo property/room/maintenance resources exist.

`domain_event_outbox` and `domain_event_effects` provide transactional, deduplicated effect delivery. Current typed notification events cover incidents and corrective actions; generic integration events and module flow commands already exist. This is the correct seam for an MPS adapter, not direct MPS database coupling.

## 11. Branding and email architecture

Verified branding commits:

- `4b78cd57`: password reset, magic link and invitation wording in `packages/auth/src/server.ts` changed to Uvanoo Portal.
- `2a8ea721`: completed Uvanoo wording in auth/email-render tests and fallback renderer.
- `5f1bdf32`: changed the favicon route to serve the Uvanoo favicon directly.

Authentication email wording matches the requested reset sentence/subject and Uvanoo magic-link/invite wording. The platform branding page exists at `/platform/branding`; `apps/web/src/app/(app)/platform/layout.tsx` and its action explicitly require super-admin. It stores only product name, logo URL and primary colour in global `platform_settings.branding`.

The requested super-admin-only **Email Branding** capability is not complete: sender/display name, footer, support contact and auth wording/templates are not part of `PlatformBranding`; auth copy remains hard-coded. Tenant email transport/template administration is a separate capability and must not gain platform-brand access.

Many customer-facing BeaconHS references remain, including package/import identifiers, navigation labels, manuals, assistant prompts, manifest/service worker default names, UI metadata and deployment assets. Internal package renaming should not be part of the MVP; customer-facing references need a separately inventoried branding pass.

## 12. CI, testing and deployment

There are 315 TypeScript test files spanning integrity, authorization, queue contracts, workflows and UI behavior. Root CI requires format, typecheck, lint, test and build. GitHub Actions contains CI, security and dev deployment workflows. Docker supports Postgres, Redis, MinIO, Mailpit and Collabora locally; deployment uses immutable images, migrations, Dokploy/Swarm and readiness checks. Existing production documentation is `docs/PRODUCTION_RUNBOOK.md`.

The deployment is capable but not a license to deploy this audit. The existing deployment workflow is environment-labelled dev despite the historical brief mentioning a production VPS; no production connection was made or needed.

## 13. Reusable components

- tenant context/RLS, RBAC/scopes, audit, reference counters and tenant-aware relation patterns;
- attachment upload/finalization, signatures, photos/evidence, PDF rendering and private storage;
- form builder, inspection bank/criteria/record flows, compliance engine and report/dashboard primitives;
- incidents, corrective actions, people/training/documents, equipment QR and work-order UI patterns;
- BullMQ queues, scanner patterns, notifications/preferences, email render/transports and transactional outbox;
- generic API authentication/idempotency/OpenAPI and integration export ledger.

## 14. Missing components

- hospitality hierarchy (group/property/building-or-wing/floor/room-or-apartment) and room identity/status;
- QR target registry and anonymous/authenticated room scan/report route;
- a maintenance issue/work-order model that targets rooms as well as assets;
- task templates, recurrence, materialized task occurrences, reminders/escalation/exceptions and sign-off;
- hotel dashboard/read models; contractor domain; hospitality module entitlements;
- fire/water-specific registers/content; manager weekly/monthly snapshot/signature records;
- complete platform email-branding model and customer-facing rebrand sweep.

## 15. Architecture risks

1. Forcing rooms into `org_units` either requires widening a construction enum and changes its established semantics, or loses room-specific fields/querying.
2. Making `equipment_work_orders.item_id` nullable or using fake equipment for rooms corrupts asset integrity and maintenance reporting.
3. Treating nav visibility as entitlement creates direct-route/API exposure.
4. A scheduler that computes tasks only at display time cannot provide stable assignments, escalation, evidence or audit history; occurrences must be materialized idempotently.
5. Workflows span web, worker, RLS, audit, notification and event contracts; a partial feature will create orphaned data or silent notifications.
6. Fire/legionella content may encode jurisdiction-specific legal assumptions; configuration and legal ownership must be explicit.
7. Branding is incomplete despite the three verified commits; broad global replacement risks internal package/tooling breakage.

## 16. Recommended hospitality domain model

Create dedicated tenant-scoped tables rather than changing `org_units`:

- `hospitality_groups` (optional group/portfolio), `properties`, `property_buildings`, `property_floors`, `property_rooms`.
- `properties` carries address/timezone/operational status; rooms carry type, code/number, floor/building IDs, operational status and metadata. Use tenant-aware composite FKs, stable codes and soft-delete where appropriate.
- `hospitality_assets` is not needed initially: keep actual equipment in `equipment_items`, adding an optional room placement association only when the asset workflow requires it.
- `qr_targets` maps an opaque globally unique token to `target_type`/target ID; MVP target type is `room`. It is safer and extensible than adding separate token columns to every future target.

Initial files: `packages/db/src/schema/hospitality.ts`, its export in `schema/index.ts`, one additive migration, `rls.ts`, seed helpers and integrity/RLS tests. Do not alter `org_units` in the first slice.

## 17. Recommended diary and scheduler model

Create `operational_task_templates`, `operational_task_schedules`, `operational_task_occurrences`, `operational_task_evidence`, `operational_task_escalations` and `operational_task_exceptions`.

- Templates define checklist/form link, title, department/assignee policy, target scope and completion/evidence/sign-off requirements.
- Schedules store IANA timezone, recurrence (RRULE or constrained structured recurrence), start/end and active state.
- A worker materializes deterministic occurrences using a unique `(schedule_id, occurrence_at)` key. Occurrences own due time, assignment snapshot, lifecycle (`open`, `in_progress`, `completed`, `overdue`, `escalated`, `waived/cancelled`), evidence and audit history.
- Reminder/escalation policies are explicit rows/configuration and produce idempotent notifications/events. Corrective action is an optional linked consequence, not a replacement for the overdue task.
- Reuse existing queues/scanner conventions and evidence/audit/notification plumbing; add a dedicated `operational-tasks` scanner rather than an unbounded repeatable job per tenant/template.

## 18. Recommended room maintenance model

Create generic `maintenance_issues`, `maintenance_work_orders`, `maintenance_work_order_events` and `maintenance_work_order_evidence`. An issue may target a room now and an equipment item later using validated `target_type` + typed optional foreign-key columns (prefer explicit `room_id` and `equipment_item_id` with a check that exactly one is present over an unvalidated polymorphic UUID).

Issue state is report/triage; work order state is assigned/work/in-progress/awaiting-parts/completed/verified/closed. Preserve reporter/assignee/verifier, priority, timestamps, comments, evidence, costs and immutable events. Keep `equipment_work_orders` unchanged; later provide a common maintenance cockpit/read model that unions both systems if needed.

The room QR route resolves `qr_targets`, applies public-report anti-abuse policy or authenticated context, captures report/evidence, creates an issue and audits it. It must not reuse `/equipment/scan/[qrToken]` because that route assumes an asset/station workflow.

## 19. Recommended manager sign-off model

Create `manager_signoff_periods`, `manager_signoff_snapshots`, `manager_signoff_comments` and signature/evidence links. The period identifies property, type (weekly/monthly), local-time boundary and data-cutoff. Snapshot data is computed server-side at signing and persisted as immutable JSON plus aggregate counters/references. It covers open/overdue tasks, maintenance, incidents, compliance, corrective actions, relevant training/contractors and exceptions.

Require a dedicated `hospitality.signoff.complete` permission, manager eligibility policy, confirmation text and optional signature attachment. Store signer tenant-user/person, server timestamp, role snapshot and audit log; never mutate a signed snapshot. Corrections create a new revision/addendum.

## 20. Recommended module activation model

Create `tenant_module_entitlements` with stable module keys, state (`enabled`, `disabled`, trial/expiry if commercially required), effective dates and platform actor metadata. Entitlements are platform-owned; tenant admins may view but not modify them. A small server-side `requireModule(ctx, key)` guard is used by routes/actions/API; nav resolver reads the same effective entitlement to hide disabled modules. Seed core/base modules intentionally. This is separate from `tenant_nav_config`.

## 21. Recommended API resources and domain events

Add versioned explicit resources rather than exposing new tables only through report entities:

- `/api/v1/properties`, `/buildings`, `/floors`, `/rooms`, `/maintenance/issues`, `/maintenance/work-orders`, `/operational-tasks`, `/manager-signoffs`.
- Use existing API-key auth, permission checks, RLS, idempotency and OpenAPI generator. Start read-first; write only where the MVP requires it.
- Emit transactional outbox events: `maintenance.issue.created`, `maintenance.work_order.assigned`, `maintenance.work_order.completed`, `maintenance.work_order.verified`, `operational_task.overdue`, `operational_task.escalated`, `manager_signoff.completed`, `room.status.changed`.
- Define an MPS adapter behind `packages/integrations` mapping Uvanoo API/domain events to MPS. No direct MPS schema imports.

## 22. Seven-day MVP architecture

The MVP is one property-centred vertical slice: dedicated hospitality hierarchy + room QR; maintenance issue/work order + evidence/verification; operations task schedule/occurrence scanner + alerts/escalation; sign-off snapshots; existing compliance templates/dashboard widgets. Fire, water and H&S are configured templates/obligations targeted to properties/rooms initially, with native specialist registers deferred.

## 23. Seven-day development plan

1. **Day 1:** land hospitality schema/RLS/permissions/entitlements and property/room CRUD with tests.
2. **Day 2:** QR target/label generation and mobile room scan/report workflow.
3. **Day 3:** maintenance issue/work-order lifecycle, evidence, audit, notifications and manager list/dashboard tile.
4. **Day 4:** task templates/schedules/occurrences and idempotent scanner.
5. **Day 5:** completion/evidence/reminder/overdue/escalation and corrective-action linking.
6. **Day 6:** weekly/monthly sign-off snapshot/signature, hotel dashboard and compliance starter templates.
7. **Day 7:** cross-tenant/security/e2e tests, migration rehearsal, mobile QA, documentation/runbook and controlled dev deployment.

## 24. Parallel Codex workstreams

- A: hospitality hierarchy, permissions/entitlements, CRUD and tests.
- B: QR target/labels and room maintenance workflow.
- C: scheduler/task occurrence scanner, notifications/escalations.
- D: dashboard/sign-off/compliance starter configuration and documentation/QA.

## 25. Dependencies between workstreams

A defines IDs, permissions and module guard contracts before B/C/D integrate. B depends on room and QR target schema; C depends on property/room targeting and task permissions; D depends on read models from B/C. Shared migration/RLS/index changes should be owned by A to avoid conflicting schema edits. Event names/contracts should be agreed before B/C implement producers.

## 26. Testing strategy

Add unit tests for recurrence/timezone/DST materialization, state transitions, entitlement/permission guards, QR token resolution, snapshot determinism and event deduplication. Add DB integrity/RLS tests for all new tables/FKs/checks. Add route/server-action tests for tenant isolation and anonymous QR rate/access policy. Add Playwright-style or existing integration-level mobile-path coverage for room scan to verified order and task completion to sign-off. Run root format/typecheck/lint/test/build before merge; rehearse migrations against a restored non-production copy.

## 27. Deployment strategy

Use additive, idempotent migrations only. Ship schema and guards before exposing navigation. Deploy through existing immutable-image CI/Dokploy route to the intended non-production environment, validate readiness plus queued scanner behavior and audit records, then use the documented backup/rollback controls. Do not deploy or connect to production in this phase.

## 28. Highest-risk items

- Scheduler recurrence/timezone/DST/idempotency and escalation duplicate prevention.
- Public QR report abuse/privacy and attachment upload authorization.
- Generic room/asset maintenance design and cross-module reporting without corrupting equipment semantics.
- RLS coverage and accidental super-admin/tenant boundary bypass.
- Scope expansion from compliance templates into jurisdiction-specific regulatory products.

## 29. Questions requiring human decision

1. Is a Uvanoo tenant one hotel group/customer, with properties nested below it, or must a group span multiple tenants?
2. Which jurisdictions and exact fire/legionella standards are in MVP scope, and who owns their content/legal review?
3. Should unauthenticated QR users be allowed to file issues, and if so what identity, rate limit and anti-spam requirements apply?
4. Which roles may complete, verify and sign off work, and is cryptographic/handwritten signature required?
5. What is the initial commercial entitlement matrix and tenant-admin visibility of disabled modules?
6. Are contractors only external assignees in MVP, or is document/insurance/competency management required now?
7. Does the product require an actual Uvanoo brand asset/domain and sender identity before email-branding work?

## 30. Exact first implementation tasks

1. Approve the tenant/group model and anonymous QR policy above.
2. Add a focused ADR for dedicated hospitality hierarchy and generic maintenance; then create the additive schema/migration/RLS/permissions/entitlement guard.
3. Build property → building → floor → room management and room QR labels, with tenant/RLS tests.
4. Build room QR report → maintenance issue → work-order lifecycle and evidence/verification.
5. Add operational task templates, materialized occurrences and scanner with deterministic recurrence tests.
6. Add reminder/overdue/escalation delivery and manager dashboard read models.
7. Add immutable weekly/monthly sign-off snapshots and signature flow.

## Evidence inspected

Root/nested instructions and config: `AGENTS.md`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.github/workflows/*`, `docker-compose.yml`, `deploy/dokploy-dev.compose.yaml`, existing `docs/*`.

Architecture/security/domain: `apps/web/src/lib/auth.ts`, `apps/web/src/lib/nav/{registry,resolve}.ts`, `apps/web/src/lib/platform-branding-config.ts`, `packages/{auth,tenant,compliance,events,jobs,emails,email-render,storage,reports,integrations}/src`, all schema filenames, `packages/db/src/{rls,migrate,seed}.ts`, and schema files for core/IAM/org/locations/equipment/maintenance/inspection/compliance/incidents/corrective-actions/training/notifications/attachments/audit/domain-events/platform settings/tenant nav.

Module evidence: route trees for web API/app modules; equipment QR/work-order files; worker scheduler/scanners/handlers; 315 test files; API v1 route/OpenAPI files; and branding commits `4b78cd57`, `2a8ea721`, `5f1bdf32`.

## Historical-brief contradictions

- The brief describes existing generic locations; actual `locations.ts` is customer contacts and the hierarchy is `org_units` with construction-specific levels.
- The brief describes a future super-admin Email Branding requirement; actual platform branding is present but covers only product name/logo/colour, not email branding.
- The brief implies a hospitality foundation; the actual codebase is still primarily construction-oriented, despite the verified Uvanoo authentication-email/favicon changes.
- The requested scan path exists only for equipment and redirects to equipment station flow; no room QR path exists.
