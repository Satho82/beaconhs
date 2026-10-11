# Risk Assessments — Decision 13 lifecycle proposal

**Status: proposed architecture for Controller approval; not implemented or migrated.**

Approved base: `14eddbdf3bfa0e43fa4b50de10ba24940dadf6d0`.
Worktree: `work/risk-assessments`, branch `feature/uvanoo-v1.4-risk-assessments`.
This document supersedes the shorter Decision 11 proposal, preserving its accepted
interim rule: saved hazards are editable, their IDs remain stable, unsaved additions
may be removed, and saved hazards cannot be physically deleted.

Decision 13 approves the direction only. No schema, migration, RLS, catalogue,
shared navigation or deployment changes are authorized by this document.

## 1. Lifecycle and transaction contract

A saved hazard is **active → archived → active**. Archive and restore require
`hospitality.manage`, the proposed `hospitality.risk` entitlement, the existing
property permission, a non-blank reason (1–2,000 characters), explicit confirmation,
and the caller's expected assessment content revision.

1. Resolve tenant context on the server. Lock the assessment `FOR UPDATE`; validate
   tenant/property scope and expected revision before locking hazards in ID order.
2. Re-read the target hazard under that assessment. Never accept tenant, assessment
   or property identity changes from the client. Reject already-archived archive or
   already-active restore requests as stale operations, without allocating a revision.
3. Count unresolved linked actions and require confirmation identifying that count.
   If the count changes before the transaction, re-confirm rather than silently accept.
4. Change archive metadata only. Do not change the hazard ID, sort order, descriptions,
   scores, controls, action status, action ownership or action source ID.
5. Allocate one content revision for the entire successful operation, insert its full
   snapshot and transactional audit, and commit together. A failed audit or snapshot
   insert rolls everything back. Restore clears current archive columns; immutable
   revisions and audit retain who archived/restored, when and why.

Every assessment save, adoption, matrix change, lifecycle sign-off and archive/restore
must use this same parent-lock order. A stale browser save must fail with a reload
message, not overwrite someone else's edit. Archived hazards cannot receive new
corrective actions or content edits until restored. This guard must cover the generic
corrective-action API in `apps/web/src/lib/api/write.ts`, imports and background jobs,
not just the Risk server action. Action creation locks the parent before rechecking
hazard activity. Existing actions remain editable under existing Actions permissions.

Current screens default to active hazards, with an archived count and explicit
include-archived view. Reports separate active and archived hazards; unresolved
linked actions remain visible and countable. Operational risk totals use active
hazards. Sign-off requires at least one active hazard. Historical views never apply
current archive filters. Restore uses the original identity; it is not a clone.

## 2. Exact proposed storage changes

Physical names/types below are the requested schema contract, not executable
migration files. Existing columns and constraints remain unless explicitly listed.
No migration number is reserved; the Controller must allocate journal entries.

### `risk_hazards`

| New column                   | PostgreSQL definition          | Meaning                                 |
| ---------------------------- | ------------------------------ | --------------------------------------- |
| `archived_at`                | `timestamptz NULL`, no default | Null means currently active             |
| `archived_by_tenant_user_id` | `uuid NULL`, no default        | Same-tenant membership that archived it |
| `archive_reason`             | `text NULL`, no default        | Required non-blank reason when archived |

Add `risk_hazards_archive_state_ck`: either all three columns are null, or all
three are non-null and `char_length(btrim(archive_reason)) BETWEEN 1 AND 2000`.
Add `risk_hazards_archive_actor_fk`: `(tenant_id, archived_by_tenant_user_id)` →
`tenant_users(tenant_id, id)`, `ON UPDATE RESTRICT ON DELETE RESTRICT`.
Add `risk_hazards_active_assessment_idx` on `(tenant_id, assessment_id, sort_order)`
where `archived_at IS NULL`. Retain the existing unique order constraint across ALL
hazards; do not reuse an archived row's order or ID. Existing parking/reorder logic
must include archived rows, even when they are hidden from the editor.

Add a before-update trigger rejecting changes to `id`, `tenant_id`, `assessment_id`.
Add before-delete and before-truncate triggers rejecting physical removal. The
assessment's `property_id` also becomes immutable once a content revision exists;
property reassignment must be a separately approved workflow, not an edit shortcut.
These guards apply to runtime platform connections too, not only tenant roles.

### `risk_assessments`

| New column         | Final PostgreSQL definition        | Meaning                                                                    |
| ------------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| `content_revision` | `integer NOT NULL DEFAULT 0`       | Unsaved initialization sentinel; committed records must have a revision ≥1 |
| `matrix_snapshot`  | `jsonb NOT NULL`, no final default | Validated scoring definition copied at adoption/change                     |

Add `risk_assessments_content_revision_ck` (`content_revision >= 0`). During adoption,
insert the parent at 0, insert hazards, then advance to 1 and snapshot in the same
transaction. A deferred consistency trigger prevents committing the zero sentinel
or a current revision without a matching version row. Existing parents receive an
explicit migration baseline revision 1, as described below.

Add `risk_assessments_matrix_ck` using the versioned validation function in section 3.
No change to `lifecycle_version`: formal sign-off numbering remains separate from
content revisions. A reminder-only metadata update does not allocate a content
revision; content, matrix, archive and sign-off changes do. The exact excluded
operational fields are `last_reminder_review_date` and `updated_at` only.

### `risk_templates`

Add `matrix_snapshot jsonb NOT NULL`, no final default, using the same matrix
validation check. Backfill existing templates with the explicit canonical 5×5
configuration. Copy that JSON into adopted assessments and tenant templates.
Published master/tenant template changes create a new version, not an in-place
rewrite of previously adopted guidance. Existing adopted JSON stays untouched.

### New `risk_assessment_versions`

| Column                 | PostgreSQL definition                        |
| ---------------------- | -------------------------------------------- |
| `id`                   | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| `tenant_id`            | `uuid NOT NULL`                              |
| `assessment_id`        | `uuid NOT NULL`                              |
| `revision`             | `integer NOT NULL CHECK (revision > 0)`      |
| `actor_tenant_user_id` | `uuid NULL`                                  |
| `event`                | `text NOT NULL`                              |
| `reason`               | `text NULL`                                  |
| `snapshot`             | `jsonb NOT NULL`                             |
| `created_at`           | `timestamptz NOT NULL DEFAULT now()`         |

No `updated_at`, soft deletion, mutable status or cascade cleanup on this table.

Constraints and indexes:

- Unique `risk_assessment_versions_revision_ux` on `(tenant_id, assessment_id, revision)`.
- Composite `risk_assessment_versions_assessment_fk` to
  `risk_assessments(tenant_id, id)`, `ON UPDATE RESTRICT ON DELETE RESTRICT`.
- Composite `risk_assessment_versions_actor_fk` to `tenant_users(tenant_id, id)`,
  `ON UPDATE RESTRICT ON DELETE RESTRICT`. Memberships referenced by history must be
  deactivated rather than physically removed. Retention/erasure is a separate decision.
- `event` is one of `baseline`, `adopted`, `edited`, `hazard_archived`,
  `hazard_restored`, `matrix_changed`, `signed_off` (text CHECK, no new enum).
- Actor null is allowed only for `baseline`; all other events require an actor.
  Archive/restore/matrix-change events require a reason of 1–2,000 trimmed characters.
- Snapshot must be an object with numeric `schemaVersion: 2`, matching tenant,
  assessment ID and revision, a valid matrix, and a hazards array. JSON validation
  is versioned and immutable; never replace validation semantics for old snapshots.
- The unique revision index supports assessment history paging backwards; no
  redundant global timestamp index or cross-tenant lookup is needed initially.

### Snapshot v2 contract

Each immutable snapshot contains these complete values, not references to mutable
current rows:

```text
schemaVersion: 2
provenance: { kind: "native" | "migration_baseline", capturedAt: ISO timestamp }
tenantId, assessmentId, contentRevision
assessment: all assessment business fields including propertyId, templateOwnerKey,
  templateId, adoptedTemplateVersion, adoptedTemplateSnapshot, reference, title,
  areaLocation, activityEquipment, creator/assessor/responsible membership IDs,
  assessmentDate, effectiveDate, validityMonths, nextReviewDate, expiryDate,
  reminderLeadDays, lifecycleVersion, status, comments, deletedAt
matrix: the exact matrix_snapshot JSON
hazards: every active AND archived hazard, ordered by sortOrder then ID, containing
  id, tenantId, assessmentId, sortOrder, descriptions, peopleAtRisk, initial and
  residual factors/scores, controls, additionalControls, archive timestamp/actor/reason
property: { id, name, address }
tenant: { id, name }
assessor: { tenantUserId, displayName }
linkedActions: { id, sourceHazardId, title, status, ownerTenantUserId, ownerName,
  dueDate }[] as observed at capture (existing action fields mapped explicitly)
```

Action observations do not purport to be a full action audit. Later action status
changes remain in the Actions audit/history and do not rewrite assessment revisions.
Snapshot generation locks linked action rows in ID order after hazards for a
consistent capture. New action writes touching a risk source follow the parent lock
order. All writers must be checked for lock-order inversions before enabling this.

For new formal sign-offs, extend the existing snapshot JSON with `schemaVersion`,
`contentRevision`, matrix, stable hazard IDs/archive metadata and action observations.
Add nullable `content_revision integer` to `risk_assessment_signoffs`, positive if set,
and composite FK `(tenant_id, assessment_id, content_revision)` to the new version
unique key, `ON UPDATE RESTRICT ON DELETE RESTRICT`. Legacy rows keep null. A new
sign-off must reference the revision captured in the same transaction. Its snapshot
and referenced revision must agree; a deferred validator enforces that relationship.

Add immutable update/delete/truncate guards to sign-off rows as well. Corrections
create another sign-off; never amend a signed payload. These are proposed additional
protections, not a claim that baseline sign-off JSON is already DB-immutable.

## 3. Matrix definition and validation

Use the existing `RiskMatrixConfig` shape inside an explicit versioned envelope:

```text
{
  schemaVersion: 1,
  modelKey: "uvanoo-5x5-v1" | "uvanoo-3x3-v1",
  size: 5 | 3,
  axes: { severity: { values: string[] }, likelihood: { values: string[] } },
  cells: { "zeroBasedSeverity:zeroBasedLikelihood": { score, label, color } }
}
```

Reuse the existing matrix renderer and its color tokens. Storage validation function
`risk_matrix_snapshot_valid_v1(jsonb)` is immutable, strict, security-invoker, with a
fixed safe search path and no table reads. It validates exact object keys and types,
square axis dimensions, nonempty labels, exactly size² unique cell keys, integer
product score `(row+1)*(column+1)`, allowed model/band pairing and approved color tokens.
No arbitrary formulas, CSS or unchecked matrix cell labels are accepted. Axis labels
may be configured; model band assignments remain canonical in this first scope.

Existing 5×5 data keeps its actual scoring convention: 1–4 Low, 5–9 Medium,
10–16 High, 17–25 Critical. The shared UI's unrelated default must not reclassify it.
The approved reference 3×3 matrix is categorical, not the 5×5 score threshold function:

| Severity / likelihood | Low    | Medium | High   |
| --------------------- | ------ | ------ | ------ |
| Low                   | Low    | Low    | Medium |
| Medium                | Low    | Medium | High   |
| High                  | Medium | High   | High   |

Keep existing SQL factor-product checks (1–5). Additionally validate all four hazard
factors against the parent matrix size, with parent-locking write guards. A deferred
assessment consistency trigger checks ALL hazards and the final parent matrix at
commit, so same-transaction matrix+factor edits cannot leave an inconsistent state.
No silent rescaling. A 5×5→3×3 change requires explicit rerating of each out-of-range
active hazard. Archived hazards cannot be edited, so any out-of-range archived hazard
blocks the change until explicitly restored/rerated and, if desired, archived again.
Historical values remain in the old revision. Display, analytics, register and PDF
must use the snapshot's cells, never today's tenant defaults.

Deferred consistency validation must compare the final persisted assessment/hazards
with the inserted revision payload, not merely check that a revision row exists.
For each changed parent, enforce exactly previous revision +1 per transaction and
one snapshot; reject old writers that modify content without revision allocation.
All these trigger functions use invoker security; no caller-set bypass flag.

## 4. RLS, roles and entitlement integration

### RLS and grants

Register the new table in both applicable RLS table lists in `packages/db/src/rls.ts`.
Enable and FORCE RLS. Use the existing tenant equality plus
`propertyParentPredicate('risk_assessment_versions', 'risk_assessments', 'assessment_id')`.
SELECT and INSERT require both tenant and parent-property scope; there are NO runtime
UPDATE/DELETE policies. Use existing context settings and helpers unchanged.
Do not recreate or weaken migration 0057's policies or role separation.

Grant SELECT/INSERT to `beaconhs_app` and `beaconhs_super`, SELECT to
`beaconhs_backup`; revoke UPDATE/DELETE/TRUNCATE on versions. The owner remains
`beaconhs_owner`, never an application login. Trigger guards reject mutation even
through `beaconhs_super` (BYPASSRLS does not bypass triggers). PostgreSQL owners and
superusers can administratively alter protections: operational access remains
restricted and reviewed; do not describe this as immutable against a database owner.

**Provisioning dependency:** `scripts/cluster/provision.sql` grants broad DML on all
public tables and default privileges. After Controller approval, add narrow
idempotent exceptions for these append-only tables at the end of provisioning, as
well as grants in the new migration. Preserve all other grants. Trigger guards are
required even if a later provisioning run accidentally broadens grants. Add a real
SQL test that reruns provisioning and proves immutability remains enforced.

Never add `archived_at IS NULL` to hazard RLS. Corrective-action property provenance
resolves `risk_hazard → risk_assessment → property`, and archived sources must stay
resolvable. No broadening of template global read-only policies. The version parent
must remain addressable after retirement; no historical query may filter on current
active status. Hard deletion of assessments/tenants with retained history is blocked
by restrictive FKs; no new cascade-delete path is introduced.

### Entitlement: `hospitality.risk`

Reuse `tenant_module_entitlements`, not a second feature-flag table. It already has
text `module_key`, state, effective dates, changed-by actor, and unique
`(tenant_id,module_key)`. **No table or enum migration is needed for this key.**

Add the key to `apps/web/src/lib/module-entitlements/catalogue.ts` only after approval.
The existing Platform Admin module control uses the catalogue and
`setTenantModuleEntitlement`; preserve its platform operator boundary and transactional
audit. Tenant admins cannot self-enable the module. Effective access requires enabled
state, `effective_from <= now` when present, `effective_until > now` when present;
missing, disabled, future and expired grants deny access.

Apply `assertTenantModuleEntitled(ctx, 'hospitality.risk')` at service entry points,
server actions, direct routes, CSV/PDF exports and job execution. Do not rely on
hiding navigation. Recheck authorization when a queued export runs and when its
artifact is downloaded. Keep RBAC (`hospitality.read/manage`), tenant RLS and property
scope as independent requirements. Platform control of entitlement is not automatic
access to another tenant's risk content.

After approval, map EXISTING Risk navigation nodes to this key in the existing
registry/resolver. No sidebar reordering, graphics, header or branding changes.
Controllers must explicitly approve shared catalogue/nav file edits. Test platform
module controls, effective-date boundaries, deep links and disabled tenants.

Activation is a separate, audited tenant configuration step. Do not grant Risk to all
tenants merely because they have hospitality/compliance access. Obtain an explicit
tenant grant manifest before cutover; synthetic tenants A/B can be enabled for tests.

Existing linked corrective actions remain visible under Actions permissions when
Risk is disabled, including stored source reference/title and existing audit. New
risk-origin actions, source detail navigation, assessment edits and Risk exports are
denied. Entitlement must not orphan existing obligations. No risk entitlement predicate
is added to shared action RLS. This boundary requires Actions-controller review.

## 5. Migration and enablement sequence (future, separately approved)

All phases first run only in the dedicated isolated synthetic database. Applying them
to shared DEV, staging or production is outside this authorization.

1. **Allocate and review.** Controller reserves migration journal sequence, reviews
   schema/type exports, RLS installer, provisioning exceptions, all writer integrations
   and the exact entitlement grant manifest. Verify no concurrent migration collision.
2. **Capture evidence.** Approved backup/restore rehearsal, row counts, hazard IDs,
   linked-action provenance, and hashes of every existing sign-off JSON. Record the
   current schema version and application build. Confirm adequate disk and lock budget.
3. **Quiesce Risk writers.** Pause only Risk mutations and Risk jobs using the existing
   controlled application gate; do not leave old writers running across cutover.
   Reads can remain available only if safe under the chosen migration locks.
4. **Expand.** Add nullable matrix columns, archive columns, revision column and new
   version/sign-off linkage objects. Install validators, scoped policies and restricted
   grants in the same deployment phase before runtime access. Use bounded lock timeouts
   and abort on conflict; do not wait indefinitely or disable RLS.
5. **Backfill current state.** Existing hazards are active. Validate existing factors,
   assign canonical 5×5 snapshots and create exactly one revision-1 migration baseline
   per existing assessment, including retired/soft-deleted parents. Record null actor,
   capture timestamp and `migration_baseline` provenance. It represents the observed
   current state, NOT invented past versions. Re-runs verify matching state rather than
   overwrite rows. Preserve existing sign-off JSON and lifecycle numbering exactly.
6. **Validate and constrain.** Reconcile every parent/revision and action source; check
   no orphan/cross-tenant links, all matrices and all saved factors. Set matrix NOT NULL,
   remove transitional defaults, validate new CHECK/FK constraints, install deferred
   consistency/immutability triggers. Recompute hashes to prove legacy signed payloads
   unchanged. A failed validation stops activation with the old data preserved.
7. **Deploy coordinated readers/writers after approval.** Every writer now snapshots
   atomically; reports support legacy snapshots and v2. Enable archive/matrix UI only
   after a capability check proves schema and guards present. Do not deploy a matrix
   selector ahead of its storage/report support. No destructive cutover migration.
8. **Entitlement enablement.** Apply only separately approved tenant grants through
   the platform control; then enable route/job guards and existing nav mapping together.
   No tenant silently loses data and no tenant silently receives a new licence.
9. **Run acceptance gates.** Two tenants, multiple properties, role combinations,
   concurrent operations, snapshots and PDF/browser checks below. Resume approved Risk
   writers only after passing. Any later environment promotion requires separate approval.

Backfill is an explicitly approved migrator operation with scoped context, not a
runtime superuser shortcut. For large tables use resumable batches before final
constraint validation; exact batch/lock limits depend on measured isolated rehearsal.
No SQL files or migration journal entries are supplied in this proposal checkpoint.

## 6. Rollback and historical preservation

Before any new writes, a failed expansion/backfill can roll back its transaction or
leave additive columns/table unused with Risk mutations paused. Do not delete snapshots,
reassign hazard IDs or drop populated columns to make an old binary run.

After archive/3×3/revision writes exist, the previous binary is NOT a safe writable
rollback: it ignores archive state, uses fixed 5×5 ratings and does not allocate
revisions. Fail closed for Risk mutations/exports, retain data and use a corrected
compatible build (roll forward). The new consistency guards reject old writers.
A tenant entitlement rollback disables new Risk operations while preserving existing
Actions obligations and stored evidence. Never reverse-grant all tenants as a shortcut.

Restore a verified backup only to a new isolated database for investigation; do not
replace a database containing newer accepted writes without a separate data recovery
decision and reconciliation plan. Schema down-migrations dropping history are excluded.

Legacy signed snapshots keep their exact JSON and legacy renderer. They lack stable
hazard IDs, archived state and matrix metadata: never infer IDs by description or
rewrite them as v2. Render their original factor values using documented legacy 5×5
semantics and label missing historical metadata honestly. Existing signed reports
omit live action rows; do not inject today's actions into old evidence.

For v2, historical reports use only the chosen snapshot, including archived hazards
and captured action observations. Live action links may show current action detail in
an explicitly separate view. Changing tenant defaults, hazard content or action state
must not alter the historical report body.

Branding currently resolves live platform/tenant assets; full historical logo freezing
is NOT provided by this schema proposal. Preserve already-exported signed PDF artifacts
under the existing artifact retention controls. A future byte-identical branded
regeneration guarantee requires approved immutable asset/PDF storage; do not claim it
from JSON snapshots alone. Tenant/property names in content snapshots remain frozen.

## 7. Required regression and acceptance checklist

The existing 75 tests remain the checkpoint floor; they include focused unit/component
and service-double tests, not a substitute for real database/browser verification.

- Stable hazard ID after repeated save/reorder; linked corrective-action identity,
  audit history and tenant/property provenance unchanged. Saved omission rejects;
  unsaved removal works; physical DELETE/TRUNCATE rejects.
- Archive/restore/edit/new-action races serialize under parent locking; no duplicate
  revisions, lost updates, orphan actions or swallowed audit failures. All generic
  API/import/job action writers covered. Restore retains ID and unresolved actions.
- Synthetic tenants A/B, plus A1/A2 properties: read/write/archive/version/export
  isolation, tenant manager vs property manager vs read-only vs no membership.
  Forged actor/hazard IDs and missing context deny access. Platform templates read-only.
- Real `beaconhs_app` and `beaconhs_super` UPDATE/DELETE/TRUNCATE history attempts fail;
  backup remains read-only. Reprovisioned grants do not weaken triggers. Migration 0057
  tests remain green with real PostgreSQL, not just mocked query builders.
- All 9/25 matrix cells, score16=High and20=Critical in 5×5, categorical3×3,
  factor bounds, explicit rerating, archived hazards and concurrent matrix changes.
- Current reports separate archive state and count open actions; pre/post-archive
  historical content is identical, both legacy and v2. Historical exports never join
  today's hazard/filter state. PDF table pagination, branding and escaping verified.
- Entitlement absent/disabled/future/expired denies page/action/export/job; grant starts
  inclusive and ends exclusive. Direct URL and artifact downloads match UI. Tenant
  users cannot self-enable. Existing corrective actions remain accessible as authorized.
- Backfill preserves signed JSON hashes, hazard/action IDs and lifecycle counts;
  failed migration/retry, lock timeouts, old-writer rejection and rollback rehearsal.
- Browser adoption/amend/edit/renewal/history/PDF under persisted synthetic data, using
  the original PNG for visual review. No service startup is authorized by this checklist.

## 8. Approval surface and unresolved inputs

Approval is requested for the precise schema/trigger/RLS/provisioning contract above,
shared catalogue/nav entitlement integration, and coordinated writer/report changes.
There is no request here to execute migrations, start services or publish code.

Decision 15 supplies the exact approved RA-001–RA-050 references, titles and six
categories. The former missing-catalogue blocker is resolved. The review copy is in
`risk-visual-review/catalogue.json`; its newly authored guidance is draft, distinct
from the approved topic names. Database installation is not authorized or performed.
These are selectable sources (Preview, Adopt, Adopt & Amend), never automatically
completed property records. Adoption must create an independent editable DRAFT.

Visual review is a separate acceptance gate. The original PNG specifies the master
Detail layout; several implemented pages do not yet match its tabs, cards and numbered
tables. An offline render is not a live persisted-data preview and cannot validate
login, RLS or PDF worker behavior. These limitations must accompany the review artifact.
