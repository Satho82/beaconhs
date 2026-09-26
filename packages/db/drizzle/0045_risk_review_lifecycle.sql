-- Forward-only Risk review lifecycle and immutable sign-off history.
ALTER TYPE "risk_assessment_status" ADD VALUE 'due_soon' BEFORE 'retired';
ALTER TYPE "risk_assessment_status" ADD VALUE 'review_due' BEFORE 'retired';
ALTER TYPE "risk_assessment_status" ADD VALUE 'overdue' BEFORE 'retired';
CREATE TYPE "risk_signoff_action" AS ENUM ('adopted','reviewed','re_adopted','amended','retired');

ALTER TABLE "risk_assessments"
  ADD COLUMN "effective_date" date,
  ADD COLUMN "validity_months" integer,
  ADD COLUMN "next_review_date" date,
  ADD COLUMN "expiry_date" date,
  ADD COLUMN "reminder_lead_days" integer DEFAULT 30 NOT NULL,
  ADD COLUMN "lifecycle_version" integer DEFAULT 1 NOT NULL,
  ADD COLUMN "last_reminder_review_date" date,
  ADD CONSTRAINT "risk_assessments_validity_months_check" CHECK ("validity_months" IS NULL OR "validity_months" IN (3,6,12,24)),
  ADD CONSTRAINT "risk_assessments_reminder_lead_days_check" CHECK ("reminder_lead_days" BETWEEN 1 AND 365),
  ADD CONSTRAINT "risk_assessments_lifecycle_version_check" CHECK ("lifecycle_version" > 0);

CREATE TABLE "risk_assessment_signoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "property_id" uuid NOT NULL,
  "assessment_id" uuid NOT NULL,
  "signed_by_tenant_user_id" uuid NOT NULL,
  "signed_by_name" text NOT NULL,
  "signed_by_role" text NOT NULL,
  "action" "risk_signoff_action" NOT NULL,
  "template_version" text NOT NULL,
  "lifecycle_version" integer NOT NULL,
  "validity_months" integer,
  "effective_date" date NOT NULL,
  "next_review_date" date NOT NULL,
  "comments" text,
  "signed_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "risk_assessment_signoffs_tenant_assessment_fk" FOREIGN KEY ("tenant_id","assessment_id") REFERENCES "risk_assessments"("tenant_id","id"),
  CONSTRAINT "risk_assessment_signoffs_tenant_property_fk" FOREIGN KEY ("tenant_id","property_id") REFERENCES "hospitality_properties"("tenant_id","id"),
  CONSTRAINT "risk_assessment_signoffs_tenant_signer_fk" FOREIGN KEY ("tenant_id","signed_by_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id")
);
CREATE UNIQUE INDEX "risk_assessment_signoffs_tenant_id_id_ux" ON "risk_assessment_signoffs" ("tenant_id","id");
CREATE UNIQUE INDEX "risk_assessment_signoffs_assessment_version_ux" ON "risk_assessment_signoffs" ("tenant_id","assessment_id","lifecycle_version");
CREATE INDEX "risk_assessment_signoffs_assessment_date_idx" ON "risk_assessment_signoffs" ("tenant_id","assessment_id","signed_at");