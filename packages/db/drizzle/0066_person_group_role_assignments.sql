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

--> statement-breakpoint
ALTER TABLE "person_group_role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "person_group_role_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "person_group_role_assignments"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
REVOKE ALL ON "person_group_role_assignments" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "person_group_role_assignments" TO beaconhs_app, beaconhs_super;
GRANT SELECT ON "person_group_role_assignments" TO beaconhs_backup;
