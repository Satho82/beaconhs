CREATE TABLE "person_group_role_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "scope" jsonb DEFAULT '{"type":"tenant"}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "person_group_role_assignments_group_role_ux" UNIQUE("tenant_id","group_id","role_id"),
  CONSTRAINT "person_group_role_assignments_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "person_groups"("tenant_id","id") ON DELETE cascade,
  CONSTRAINT "person_group_role_assignments_role_fk" FOREIGN KEY ("tenant_id","role_id") REFERENCES "roles"("tenant_id","id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "person_group_role_assignments_tenant_idx" ON "person_group_role_assignments" USING btree ("tenant_id");
