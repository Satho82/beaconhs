CREATE TYPE "maintenance_issue_source" AS ENUM ('staff','guest_qr','inspection','scheduled_task','api_integration');
ALTER TABLE "maintenance_issues" ADD COLUMN "source" "maintenance_issue_source" NOT NULL DEFAULT 'staff';
ALTER TABLE "maintenance_issues" ADD COLUMN "assigned_to_tenant_user_id" uuid;
ALTER TABLE "maintenance_issues" ADD COLUMN "completed_at" timestamptz;
ALTER TABLE "maintenance_issues" ADD COLUMN "completed_by_tenant_user_id" uuid;
ALTER TABLE "maintenance_issues" ADD COLUMN "resolution_notes" text;
