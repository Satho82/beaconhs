-- Forward-only Hotel Handover module.
CREATE TABLE "hospitality_handovers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "property_id" uuid NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "shift" text NOT NULL,
  "custom_shift" text,
  "department" text NOT NULL,
  "note" text NOT NULL,
  "priority" text NOT NULL,
  "author_id" uuid NOT NULL,
  "room_id" uuid,
  "location" text,
  "follow_up_required" boolean DEFAULT false NOT NULL,
  "follow_up_owner_id" uuid,
  "follow_up_status" text DEFAULT 'not_required' NOT NULL,
  "carried_from_id" uuid,
  "maintenance_issue_id" uuid,
  "corrective_action_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "handover_property_fk" FOREIGN KEY ("tenant_id","property_id") REFERENCES "hospitality_properties"("tenant_id","id"),
  CONSTRAINT "handover_author_fk" FOREIGN KEY ("tenant_id","author_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "handover_owner_fk" FOREIGN KEY ("tenant_id","follow_up_owner_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "handover_room_fk" FOREIGN KEY ("tenant_id","room_id") REFERENCES "hospitality_rooms"("tenant_id","id"),
  CONSTRAINT "handover_maintenance_fk" FOREIGN KEY ("tenant_id","maintenance_issue_id") REFERENCES "maintenance_issues"("tenant_id","id"),
  CONSTRAINT "handover_action_fk" FOREIGN KEY ("tenant_id","corrective_action_id") REFERENCES "corrective_actions"("tenant_id","id"),
  CONSTRAINT "handover_shift_check" CHECK ("shift" IN ('am','pm','night','custom') AND ("shift" <> 'custom' OR ("custom_shift" IS NOT NULL AND length(trim("custom_shift")) > 0))),
  CONSTRAINT "handover_priority_check" CHECK ("priority" IN ('routine','important','urgent')),
  CONSTRAINT "handover_note_check" CHECK (length(trim("note")) BETWEEN 1 AND 10000 AND length(trim("department")) BETWEEN 1 AND 100),
  CONSTRAINT "handover_follow_up_check" CHECK (("follow_up_required" AND "follow_up_status" IN ('open','in_progress','completed')) OR (NOT "follow_up_required" AND "follow_up_status" = 'not_required' AND "follow_up_owner_id" IS NULL))
);
CREATE UNIQUE INDEX "hospitality_handovers_tenant_id_id_ux" ON "hospitality_handovers" ("tenant_id","id");
CREATE UNIQUE INDEX "hospitality_handovers_property_id_id_ux" ON "hospitality_handovers" ("tenant_id","property_id","id");
CREATE INDEX "hospitality_handovers_feed_idx" ON "hospitality_handovers" ("tenant_id","property_id","occurred_at","id");
CREATE INDEX "hospitality_handovers_follow_up_idx" ON "hospitality_handovers" ("tenant_id","property_id","follow_up_status");
CREATE UNIQUE INDEX "hospitality_handovers_carried_from_ux" ON "hospitality_handovers" ("tenant_id","carried_from_id");
ALTER TABLE "hospitality_handovers" ADD CONSTRAINT "handover_carried_from_fk" FOREIGN KEY ("tenant_id","property_id","carried_from_id") REFERENCES "hospitality_handovers"("tenant_id","property_id","id");

CREATE TABLE "hospitality_handover_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "handover_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "handover_comments_parent_fk" FOREIGN KEY ("tenant_id","handover_id") REFERENCES "hospitality_handovers"("tenant_id","id") ON DELETE CASCADE,
  CONSTRAINT "handover_comments_author_fk" FOREIGN KEY ("tenant_id","author_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "handover_comments_body_check" CHECK (length(trim("body")) BETWEEN 1 AND 10000)
);
CREATE INDEX "handover_comments_feed_idx" ON "hospitality_handover_comments" ("tenant_id","handover_id","created_at","id");

CREATE TABLE "hospitality_handover_acknowledgements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "handover_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "handover_acknowledgements_parent_fk" FOREIGN KEY ("tenant_id","handover_id") REFERENCES "hospitality_handovers"("tenant_id","id") ON DELETE CASCADE,
  CONSTRAINT "handover_acknowledgements_author_fk" FOREIGN KEY ("tenant_id","author_id") REFERENCES "tenant_users"("tenant_id","id")
);
CREATE UNIQUE INDEX "handover_acknowledgement_author_ux" ON "hospitality_handover_acknowledgements" ("tenant_id","handover_id","author_id");

CREATE TABLE "hospitality_handover_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "handover_id" uuid NOT NULL,
  "attachment_id" uuid NOT NULL,
  "uploaded_by_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "handover_attachments_parent_fk" FOREIGN KEY ("tenant_id","handover_id") REFERENCES "hospitality_handovers"("tenant_id","id") ON DELETE CASCADE,
  CONSTRAINT "handover_attachments_attachment_fk" FOREIGN KEY ("tenant_id","attachment_id") REFERENCES "attachments"("tenant_id","id") ON DELETE CASCADE,
  CONSTRAINT "handover_attachments_uploader_fk" FOREIGN KEY ("tenant_id","uploaded_by_id") REFERENCES "tenant_users"("tenant_id","id")
);
CREATE UNIQUE INDEX "handover_attachment_ux" ON "hospitality_handover_attachments" ("tenant_id","handover_id","attachment_id");
CREATE INDEX "handover_attachments_parent_idx" ON "hospitality_handover_attachments" ("tenant_id","handover_id");

