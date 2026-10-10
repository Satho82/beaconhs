# Risk Assessments — Decisions 110/112 migration preparation

**Status: PREPARED FOR REVIEW; no migration is journaled or executed.**

Decision 125: proposals are stored in `packages/db/drizzle/prepared/`, outside
the runnable migration chain. Promotion and journal registration require separate
execution approval and the backup/restore rehearsal.

This plan covers `0059_risk_template_draft_state.sql`,
`0060_risk_template_families_manual_assessments.sql`, and
`0061_risk_assessment_revisions_archive_signoffs.sql`. The approved preview baseline
remains `14eddbdf3bfa0e43fa4b50de10ba24940dadf6d0`. This preparation does not alter
shared DEV, staging, production, or the preview database.

## 0059 — template draft state

Add only the `draft` value to `risk_template_state`. Keep this migration separate
because PostgreSQL will not allow a newly added enum value to be used until the
transaction that adds it commits. Existing template rows and versions remain intact.
The 50 master templates remain active and unchanged. No tenant may change a master
template. No draft is adoptable.

Decision 126 compatibility finding: the installed Drizzle PostgreSQL runner wraps
all pending migrations in one transaction. Separate SQL files alone DO NOT provide
the required commit boundary. Do not register and run 0059–0061 together on a
database without the draft enum value. The separately approved execution plan must
commit and verify 0059 in its own migration batch before registering/running
0060–0061. The current application/RLS installer also expects the new tables, so a
normal full migration command is not a safe first-stage runner. A reviewed staged
runner and ledger verification are prerequisites to promotion. No execution plan
has been rehearsed and no migration is approved by this document.

Decision 127 adds `packages/db/src/risk-0059-runner.ts`. Its `--plan` mode checks
the reviewed single-statement proposal and journal without opening a database;
mock-transport tests verify the separate transaction, role/0058-ledger preflight,
and refusal before DDL on invalid state. `--apply` is present for a later,
separately approved operation only: it requires approval and restore-rehearsal
references, the migration login, an owner-role check, the exact 0058 ledger and
physical-schema preflight, then commits only 0059 under the migration advisory
lock. It does not insert a journal row; a later promotion plan must explicitly
review the idempotent 0059 journal step and verify the enum was committed before
0060 uses it. This runner has **not** been exercised against PostgreSQL and is
not an execution approval. On 0058, the application now blocks Risk workflows
before new-schema queries and migration maintenance omits the absent new-table
RLS/catalogue installation. Neither check proves 0060–0061 SQL runtime safety.

## 0060 — stable template families, matrix snapshots, manual origin

### `risk_template_families`

Add a family table with `id uuid PRIMARY KEY`, nullable `tenant_id`, `owner_key uuid`,
existing `risk_template_scope`, `created_at timestamptz`, and a check matching the
existing owner rule: platform means `tenant_id IS NULL` and zero `owner_key`; tenant
means `tenant_id = owner_key`. Add `UNIQUE(owner_key,id)` and tenant/owner foreign keys.
Backfill one family per current template using its existing ID as the initial family
ID, so every row stays a distinct family until an explicit user action creates a new
version. Add `(owner_key,template_family_id)` to `risk_templates` and a restrictive
composite FK to the family. Unique `(owner_key,template_family_id,version)` prevents
duplicate version identity. Keep the current title/version uniqueness checks too.

Family reads follow the current platform-template policy (platform rows readable,
never writable by tenant roles); tenant family writes are tenant scoped. Draft
management is authorized in server actions with the authenticated `RequestContext`,
existing `assertCan(ctx, 'hospitality.manage')` and property or
tenant scope. Do not use a caller-settable `app.risk_manage` or another authorization
GUC. The current trusted application authorization context is the manager boundary;
RLS independently enforces tenant/property isolation.

### Matrix and assessment provenance

Add `risk_templates.matrix_snapshot jsonb` and backfill all existing templates with
the explicit canonical 5×5 product matrix. Store a versioned envelope with `schemaVersion`,
`modelKey`, `size`, `axes`, and cells. Validate exact keys, square size (3 or 5), the
product score for each cell, known labels/bands and approved colors in application
code before writes. Tenant custom templates and each adopted assessment copy the
matrix JSON so later configuration changes cannot alter them.

Add `risk_assessments.source_kind text NOT NULL DEFAULT 'template'` constrained to
`template|manual` and `assessment_category risk_template_category`. Backfill category
from each row's adopted template snapshot; abort on any value outside the existing
enum. Drop NOT NULL from `template_owner_key`, `template_id`, `adopted_template_version`,
and `adopted_template_snapshot`; add a check requiring all four for `template` and
requiring all four NULL for `manual`. Manual assessments must have a category and
remain property scoped, DRAFT and audited. No dummy template ID or fictitious
provenance is permitted.

Add nullable `risk_assessments.matrix_snapshot`. **Do not backfill existing assessment
rows.** Their historical matrix evidence remains unknown when it was not stored at
assessment time. A new template adoption or manual assessment must persist the matrix
selected at creation. A new-row guard rejects missing matrices, and services reject
new content writes until a matrix is selected; historical NULL stays NULL and is
rendered as unknown. Never infer a historical matrix from today's tenant defaults.

## 0061 — immutable revisions, hazard archive/restore, sign-off links

### Assessment revisions

Add `risk_assessments.content_revision integer NOT NULL DEFAULT 1 CHECK(content_revision > 0)`.
Create `risk_assessment_versions` with:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
- `tenant_id`, `assessment_id`, positive `revision`, nullable actor membership,
  event, optional reason, full JSON snapshot, and immutable `created_at`;
- unique `(tenant_id,assessment_id,revision)` and restrictive composite FKs to the
  assessment and actor's `(tenant_id,id)` membership;
- allowed event values `baseline`, `adopted`, `edited`, `hazard_archived`,
  `hazard_restored`, `matrix_changed`, `signed_off`; only `baseline` may have no actor;
- restrictive event/reason checks for archive/restore/matrix change, plus a snapshot
  check requiring versioned JSON to match tenant, assessment, revision and contain
  assessment, matrix (nullable only for a migration baseline with unknown evidence),
  hazards and provenance.

Create exactly one migration-baseline revision for each existing assessment from
the row values visible at migration time. Mark it `migration_baseline` and record the
capture timestamp; do not claim it is an original historical snapshot. Include every
hazard and current linked-action observation with stable IDs. The assessment's matrix
value in this baseline is NULL because pre-migration evidence was not recorded. No
history or property/assessor facts are synthesized.

For new writes, lock the assessment before hazards and linked actions, allocate
previous revision + 1, and atomically write the current rows, immutable snapshot and
audit event. A deferred consistency guard checks exactly one new revision and matches
the final rows to its snapshot. Update/delete/truncate guards make version rows
append-only for application and BYPASSRLS runtime roles. Database owner/superuser
administrative authority is outside this guarantee.

### Hazard lifecycle and sign-offs

Add nullable `risk_hazards.archived_at timestamptz`,
`archived_by_tenant_user_id uuid`, and `archive_reason text`; require either all NULL
or all populated with a nonblank reason ≤2,000 characters, and a restrictive same-tenant
actor FK. Keep hazard ID, assessment FK, corrective-action source IDs, sort order,
content and audit rows. Archive/restore changes only lifecycle metadata and creates
an immutable assessment revision plus audit entry in the same transaction. It never
physically deletes a hazard or its action links. Historical reports/snapshots include
archived hazards with their archive state.

Add nullable positive `risk_assessment_signoffs.content_revision` with a restrictive
composite FK to the revision key. Existing sign-offs remain NULL: their historical
content revision cannot be inferred. New sign-offs reference the exact revision they
approve and keep the same revision's snapshot. Make existing sign-off snapshots
append-only; correction requires a new sign-off record. Do not change lifecycle
version numbers.

### RLS and grants

Apply ENABLE and FORCE RLS to `risk_template_families` and
`risk_assessment_versions`. Family rows use platform-readable/tenant-write policies
equivalent to `risk_templates`. Version rows require the existing tenant GUC equality
and an `EXISTS` parent assessment match on `(tenant_id,assessment_id)`; this preserves
the existing `action_scope_mode`/`action_property_ids` property boundary. Grant
runtime and maintenance only the required SELECT/INSERT on versions; revoke
UPDATE/DELETE/TRUNCATE. Keep 0057 and all current RLS policies unchanged. Register
the tables in the two RLS inventories and property-reporting inventory only after
reviewing the schema mirror.

Draft manager permission is checked by server code from the authenticated, database-
resolved role assignments; the database receives no forgeable manager GUC. Direct
tenant/property RLS is defense in depth, not a substitute for that manager check.

## Rollout and rollback

1. Review SQL and schema mirrors; run static parsing and tests on a disposable database.
2. Snapshot the isolated synthetic preview volume before its separately approved run;
   never reset it. Confirm target marker and 0057/0058 ledger first.
3. Apply 0059, verify enum and ledger; then 0060, verify ownership/family uniqueness,
   existing template IDs and manual-source checks; then 0061, verify one baseline per
   assessment, exact hazard/action links, all sign-offs, RLS, grants and immutable writes.
4. No migration step changes existing assessment content, score, hazard ID, action,
   audit row, sign-off value, tenant or property. The only backfill is family identity,
   template matrix, template-origin/category and explicitly labelled current baseline.
5. Before any new draft/manual/revision/archive write, rollback is forward-only. The
   enum label is not removed; additive columns/tables and evidence are not dropped.
   Correct faults with a later additive migration. Never restore by deleting synthetic
   evidence or recreating the volume.

## Current blockers and validation status

- No SQL migration files are journaled or executed. A separately approved migration
  execution is still required.
- A disposable PostgreSQL migration test and proof of RLS/immutability against the
  app and maintenance roles remain required before proposing execution.
- The service/schema mirror cannot safely use these fields until the approved database
  migrations are applied. Existing functioning template/edit flows remain active.
- Redis/MinIO host-connectivity repair failed a preflight guard; the one authorized
  attempt stopped before Docker Compose recreation. Do not retry without renewed
  execution approval.
