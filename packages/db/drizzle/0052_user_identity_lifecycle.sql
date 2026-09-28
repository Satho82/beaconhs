-- Retain global identities and their audit references when platform access is
-- withdrawn. Tenant membership lifecycle remains separately modelled by
-- tenant_users.status; this is intentionally not a cascading deletion.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "user_disabled_at_idx" ON "user" ("disabled_at")
WHERE "disabled_at" IS NOT NULL;
