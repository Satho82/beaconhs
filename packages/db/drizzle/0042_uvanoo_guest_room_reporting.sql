ALTER TABLE "maintenance_issues" ADD COLUMN "public_submission_id" uuid;
ALTER TABLE "maintenance_issues" ADD COLUMN "guest_name" text;
ALTER TABLE "maintenance_issues" ADD COLUMN "guest_contact" text;
ALTER TABLE "maintenance_issues" ADD COLUMN "guest_contact_consent" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "maintenance_issues_public_submission_ux"
  ON "maintenance_issues" ("tenant_id", "public_submission_id");
ALTER TYPE "maintenance_issue_status" ADD VALUE IF NOT EXISTS 'acknowledged';
ALTER TYPE "maintenance_issue_status" ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE "maintenance_issue_status" ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE "maintenance_issue_status" ADD VALUE IF NOT EXISTS 'awaiting_parts';
ALTER TYPE "maintenance_issue_status" ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE "maintenance_issue_status" ADD VALUE IF NOT EXISTS 'closed';
CREATE INDEX "maintenance_issues_tenant_status_created_idx"
  ON "maintenance_issues" ("tenant_id", "status", "created_at");
