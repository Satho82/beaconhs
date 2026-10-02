-- Work 06: tenant-bound governed import batches. Parsed previews never mutate
-- operational tables; confirmed dataset execution owns that transaction.
CREATE TYPE "public"."bulk_import_status" AS ENUM('received', 'parsed', 'ready_for_confirmation', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE "public"."bulk_import_row_status" AS ENUM('accepted', 'rejected', 'warning', 'duplicate', 'created', 'updated', 'skipped');

CREATE TABLE "bulk_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "dataset_key" text NOT NULL,
  "source_attachment_id" uuid,
  "source_digest" text NOT NULL,
  "status" "bulk_import_status" DEFAULT 'received' NOT NULL,
  "validation_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "failure_reason" text,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id"),
  "confirmed_by_user_id" text REFERENCES "user"("id"),
  "confirmed_at" timestamp with time zone,
  "processing_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bulk_import_batches_tenant_source_attachment_fk"
    FOREIGN KEY ("tenant_id", "source_attachment_id") REFERENCES "attachments"("tenant_id", "id") ON DELETE SET NULL ("source_attachment_id")
);
CREATE INDEX "bulk_import_batches_tenant_status_idx" ON "bulk_import_batches" ("tenant_id", "status", "created_at");
CREATE INDEX "bulk_import_batches_tenant_dataset_idx" ON "bulk_import_batches" ("tenant_id", "dataset_key", "created_at");

CREATE TABLE "bulk_import_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "batch_id" uuid NOT NULL,
  "source_row_number" integer NOT NULL,
  "raw_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "mapped_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "duplicate_reference" text,
  "proposed_action" text NOT NULL,
  "final_action" text,
  "status" "bulk_import_row_status" DEFAULT 'accepted' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bulk_import_rows_batch_row_ux" UNIQUE ("batch_id", "source_row_number"),
  CONSTRAINT "bulk_import_rows_tenant_batch_fk"
    FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "bulk_import_batches"("tenant_id", "id") ON DELETE cascade
);
CREATE INDEX "bulk_import_rows_tenant_batch_idx" ON "bulk_import_rows" ("tenant_id", "batch_id");
