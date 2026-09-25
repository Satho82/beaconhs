-- Forward-only Risk assessment foundation. The authoritative post-0043
-- application schema is protected by the repository forward-migration guard.
CREATE TYPE "risk_template_scope" AS ENUM ('platform','tenant');
CREATE TYPE "risk_template_state" AS ENUM ('active','retired');
CREATE TYPE "risk_template_category" AS ENUM ('catering','engineering','front_of_house','general','hotel_general','housekeeping','kitchen','leisure','meetings_events','personal','property','restaurant');
CREATE TYPE "risk_assessment_status" AS ENUM ('draft','active','retired');

CREATE TABLE "risk_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "owner_key" uuid NOT NULL,
  "scope" "risk_template_scope" NOT NULL,
  "title" text NOT NULL,
  "category" "risk_template_category" NOT NULL,
  "description" text NOT NULL,
  "version" text NOT NULL,
  "state" "risk_template_state" DEFAULT 'active' NOT NULL,
  "area_guidance" text,
  "activity_equipment_guidance" text,
  "hazards" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "people_at_risk_guidance" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "standard_controls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "further_action_guidance" text,
  "initial_risk_guidance" text,
  "residual_risk_guidance" text,
  "review_guidance" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  CONSTRAINT "risk_templates_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
  CONSTRAINT "risk_templates_scope_tenant_check" CHECK (("scope" = 'platform' AND "tenant_id" IS NULL AND "owner_key" = '00000000-0000-0000-0000-000000000000') OR ("scope" = 'tenant' AND "tenant_id" IS NOT NULL AND "owner_key" = "tenant_id")),
  CONSTRAINT "risk_templates_version_check" CHECK ("version" ~ '^[0-9]+\.[0-9]+$')
);
CREATE UNIQUE INDEX "risk_templates_tenant_id_id_ux" ON "risk_templates" ("tenant_id","id");
CREATE UNIQUE INDEX "risk_templates_owner_key_id_ux" ON "risk_templates" ("owner_key","id");
CREATE UNIQUE INDEX "risk_templates_platform_title_version_ux" ON "risk_templates" ("title","version") WHERE "tenant_id" IS NULL;
CREATE UNIQUE INDEX "risk_templates_tenant_title_version_ux" ON "risk_templates" ("tenant_id","title","version") WHERE "tenant_id" IS NOT NULL;
CREATE INDEX "risk_templates_category_state_idx" ON "risk_templates" ("category","state");

CREATE TABLE "risk_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "property_id" uuid NOT NULL,
  "template_owner_key" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "adopted_template_version" text NOT NULL,
  "adopted_template_snapshot" jsonb NOT NULL,
  "reference" text NOT NULL,
  "title" text NOT NULL,
  "area_location" text,
  "activity_equipment" text,
  "creator_tenant_user_id" uuid NOT NULL,
  "assessor_tenant_user_id" uuid NOT NULL,
  "responsible_tenant_user_id" uuid,
  "assessment_date" date NOT NULL,
  "status" "risk_assessment_status" DEFAULT 'draft' NOT NULL,
  "comments" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  CONSTRAINT "risk_assessments_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
  CONSTRAINT "risk_assessments_tenant_property_fk" FOREIGN KEY ("tenant_id","property_id") REFERENCES "hospitality_properties"("tenant_id","id"),
  CONSTRAINT "risk_assessments_template_fk" FOREIGN KEY ("template_owner_key","template_id") REFERENCES "risk_templates"("owner_key","id"),
  CONSTRAINT "risk_assessments_template_owner_check" CHECK ("template_owner_key" = "tenant_id" OR "template_owner_key" = '00000000-0000-0000-0000-000000000000'),
  CONSTRAINT "risk_assessments_tenant_creator_fk" FOREIGN KEY ("tenant_id","creator_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "risk_assessments_tenant_assessor_fk" FOREIGN KEY ("tenant_id","assessor_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "risk_assessments_tenant_responsible_fk" FOREIGN KEY ("tenant_id","responsible_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "risk_assessments_snapshot_version_check" CHECK ("adopted_template_snapshot"->>'version' = "adopted_template_version")
);
CREATE UNIQUE INDEX "risk_assessments_tenant_id_id_ux" ON "risk_assessments" ("tenant_id","id");
CREATE UNIQUE INDEX "risk_assessments_tenant_reference_ux" ON "risk_assessments" ("tenant_id","reference");
CREATE INDEX "risk_assessments_property_status_idx" ON "risk_assessments" ("tenant_id","property_id","status");
CREATE INDEX "risk_assessments_template_idx" ON "risk_assessments" ("template_id");

CREATE TABLE "risk_hazards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assessment_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "hazard_description" text NOT NULL,
  "harm_description" text NOT NULL,
  "people_at_risk" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "initial_likelihood" integer NOT NULL,
  "initial_severity" integer NOT NULL,
  "initial_score" integer NOT NULL,
  "controls" text NOT NULL,
  "additional_controls" text,
  "residual_likelihood" integer NOT NULL,
  "residual_severity" integer NOT NULL,
  "residual_score" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "risk_hazards_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
  CONSTRAINT "risk_hazards_tenant_assessment_fk" FOREIGN KEY ("tenant_id","assessment_id") REFERENCES "risk_assessments"("tenant_id","id") ON DELETE cascade,
  CONSTRAINT "risk_hazards_initial_likelihood_check" CHECK ("initial_likelihood" BETWEEN 1 AND 5),
  CONSTRAINT "risk_hazards_initial_severity_check" CHECK ("initial_severity" BETWEEN 1 AND 5),
  CONSTRAINT "risk_hazards_residual_likelihood_check" CHECK ("residual_likelihood" BETWEEN 1 AND 5),
  CONSTRAINT "risk_hazards_residual_severity_check" CHECK ("residual_severity" BETWEEN 1 AND 5),
  CONSTRAINT "risk_hazards_initial_score_check" CHECK ("initial_score" = "initial_likelihood" * "initial_severity"),
  CONSTRAINT "risk_hazards_residual_score_check" CHECK ("residual_score" = "residual_likelihood" * "residual_severity")
);
CREATE UNIQUE INDEX "risk_hazards_tenant_id_id_ux" ON "risk_hazards" ("tenant_id","id");
CREATE UNIQUE INDEX "risk_hazards_assessment_order_ux" ON "risk_hazards" ("tenant_id","assessment_id","sort_order");
