-- Secure evidence for the unified hospitality Maintenance engine.
CREATE TABLE "maintenance_issue_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "issue_id" uuid NOT NULL,
  "attachment_id" uuid NOT NULL,
  "stage" text NOT NULL,
  "source" text NOT NULL,
  "uploaded_by_tenant_user_id" uuid,
  "description" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "maintenance_issue_attachments_issue_fk" FOREIGN KEY ("tenant_id","issue_id") REFERENCES "maintenance_issues"("tenant_id","id") ON DELETE CASCADE,
  CONSTRAINT "maintenance_issue_attachments_attachment_fk" FOREIGN KEY ("tenant_id","attachment_id") REFERENCES "attachments"("tenant_id","id"),
  CONSTRAINT "maintenance_issue_attachments_uploader_fk" FOREIGN KEY ("tenant_id","uploaded_by_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "maintenance_issue_attachments_stage_check" CHECK ("stage" IN ('reported','before_work','after_work','completion')),
  CONSTRAINT "maintenance_issue_attachments_source_check" CHECK ("source" IN ('staff','guest_qr')),
  CONSTRAINT "maintenance_issue_attachments_description_check" CHECK ("description" IS NULL OR length("description") <= 1000),
  CONSTRAINT "maintenance_issue_attachments_guest_check" CHECK (("source" = 'guest_qr' AND "uploaded_by_tenant_user_id" IS NULL) OR "source" = 'staff')
);
CREATE UNIQUE INDEX "maintenance_issue_attachments_tenant_id_id_ux" ON "maintenance_issue_attachments" ("tenant_id","id");
CREATE UNIQUE INDEX "maintenance_issue_attachments_attachment_ux" ON "maintenance_issue_attachments" ("tenant_id","attachment_id");
CREATE INDEX "maintenance_issue_attachments_issue_timeline_idx" ON "maintenance_issue_attachments" ("tenant_id","issue_id","created_at");
