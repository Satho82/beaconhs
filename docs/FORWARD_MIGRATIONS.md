# Forward migrations after 0043

SQL migration history through `0043_hospitality_issue_sources` is authoritative.
Drizzle snapshot metadata is historically complete only through 0029. Running
`drizzle-kit generate` blindly for 0044+ can therefore recreate valid
post-0029 application objects.

Use `scripts/db/validate-forward-migration.sh` against a canonical database
created by the legitimate SQL history. The guard verifies the locked historical
migration hashes, the deterministic post-0043 schema dump, the next migration
number, existing-table/Hospitality recreation, destructive changes, and a
caller-supplied allowlist of objects belonging to the intended forward delta.

Example:

```sh
scripts/db/validate-forward-migration.sh "$DATABASE_URL" \
  packages/db/drizzle/0044_risk_assessment_foundation.sql \
  risk_templates,risk_assessments,risk_hazards
```

Update the baseline only through a separately reviewed baseline change against
a freshly migrated canonical database. Never fabricate snapshots for 0030–0043,
rewrite historical SQL, or replace this check with normal Drizzle generation.
