# Decision 106 — tenant template drafts and manual-origin proposal

**Status:** Approval required before schema, RLS or provisioning changes. No database changes are included in this batch.

## Current constraints

- `risk_template_state` is limited to `active` and `retired`. Tenant template saving inserts an active version 1.0 row from a saved assessment or existing template; it does not create a draft.
- `risk_templates` has editable JSON hazard content but no matrix snapshot or stable template-family/version relationship. A published row can be updated through current runtime paths unless those paths prevent it.
- `risk_assessments.template_owner_key`, `template_id`, `adopted_template_version` and `adopted_template_snapshot` are NOT NULL and reference a template. A true manual-origin assessment cannot be represented without a fake source template.
- Tenant and property RLS policies must remain in force. The current template RLS policy scopes records by tenant; manager-only draft operations also require server-side RBAC checks.

## Smallest proposed data-model change

1. Extend `risk_template_state` with `draft`. Add `template_family_id uuid` to group versions; backfill each current row to its own family ID. New versions keep one family ID and receive a new immutable template row ID.
2. Add a validated `matrix_snapshot jsonb` to `risk_templates` and a nullable snapshot to `risk_assessments`. Backfill templates using the established 5×5 configuration. **Do not backfill historical assessments**: their matrix is unknown unless it was stored at the time. New adoptions and manual assessments must save the selected matrix with the assessment. Existing hazards and scores remain unchanged. The lifecycle proposal defines validation and snapshot semantics.
3. Enforce the template lifecycle in the database and services:
   - Draft content is editable only for the owning tenant's users with `hospitality.manage`.
   - Publish is transactional and audited. It publishes a draft version and retires the previous active version in the same family.
   - Published content is immutable; a change creates a new draft version. Retired rows remain readable for provenance and existing assessments.
   - Platform rows remain read-only to tenant users. The RA-001–RA-050 rows are not updated by this feature.
   - Template list and detail services expose drafts only to authorized tenant managers; adoption only accepts active versions.
4. Add `source_kind text NOT NULL` to `risk_assessments`, constrained to `template` or `manual`, plus an assessment category using the existing `risk_template_category` enum. For `template`, retain all existing source fields and snapshot as required. For `manual`, require source template fields and adopted-template snapshot to be null; preserve the exact matrix snapshot and create a normal property-specific DRAFT with full audit and revision history. Existing rows are backfilled as `template`.
5. Keep tenant/property RLS predicates and current role boundaries. Add no shared navigation node: expose management under the existing Risk module. Add tenant ownership constraints, migration-owner-only migration, explicit FORCE RLS validation and two-tenant/property tests before release.

## Migration and rollback

The proposed sequence is `0059_risk_template_draft_state.sql` (enum extension only), `0060_risk_template_families_manual_assessments.sql` (stable template family/version identity, template matrices, nullable assessment matrix snapshots, and manual provenance), then `0061_risk_assessment_revisions_archive_signoffs.sql` (immutable revision snapshots, hazard archive/restore metadata, and sign-off revision links). For old rows, backfill template family IDs and template matrices, backfill assessment `source_kind='template'` and category from the adopted snapshot, but leave assessment matrices and historical sign-off revision links NULL when the original evidence was not recorded. Existing IDs, hazards, actions, and audit rows are preserved. Each migration must use bounded lock/statement timeouts, fail on unexpected collisions or invalid source data, and retain the current volume. No reset path exists.

Before manual-origin or draft rows exist, rollback may leave additive fields unused and keep the previous code working. After new writes exist, use a compatible roll-forward release; do not drop provenance, matrix evidence, or versions to restore an old binary.

## Approval requested

Approve the exact schema/RLS/provisioning migration design before implementation. Until then, the module keeps the existing safe Adopt / Adopt & Amend and Save as Tenant Template flows. “Create from scratch” is shown disabled with the reason; no fake blank template or automatic publication is used.
