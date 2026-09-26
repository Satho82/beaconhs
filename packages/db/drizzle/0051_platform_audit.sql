CREATE TABLE IF NOT EXISTS "platform_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "action" text NOT NULL,
  "summary" text,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "platform_audit_log_occurred_idx"
  ON "platform_audit_log" ("occurred_at");
