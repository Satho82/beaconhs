# Work 04 foundation handoff

This record captures the reusable V1.4 foundations confirmed during Work 04. It is a boundary for later implementation work, not a new operational module.

## Module access

`tenant_module_entitlements` remains the canonical commercial capability record. Platform-only mutation is implemented in `apps/web/src/lib/module-entitlements/platform.ts`; catalogue validation and effective-date rules are in `policy.ts`; tenant-facing routes must enforce the existing server entitlement helper as well as RBAC. Navigation filtering is presentation only and is never an authorization boundary. Each change is auditable.

## Active portfolio and property scope

The active-property cookie is a presentation preference, never an authority grant. `resolveHospitalityPropertyContext` resolves it only against the current request's tenant/RBAC-authorized property set. `applyActiveHospitalityPropertyScope` can only narrow that existing scope inside the current transaction. New property-owned domains must use the existing RLS/property predicate and direct-ID authorization helpers.

## Common templates and governed import/export

The forms/template/version engine is the common-template starting point. New configurable domains should use the Work 04 configuration-governance lineage and applicability relations rather than a second template engine.

Governed bulk import remains a later implementation step. It must use one lifecycle from D09: download template, private tenant-bound upload, parse, preview, validate/map/deduplicate, explicit confirmation, transactional batch import, and audit result. Dataset handlers own typed validation only. Existing scoped CSV exports, audit infrastructure, private storage, jobs, and form/template versioning are the reuse points. No import tables, routes, or UI are introduced here because a generic shell without an approved dataset handler would be non-functional.
