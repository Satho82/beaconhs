CREATE TABLE "platform_error_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" text NOT NULL,
  "message" text NOT NULL,
  "digest" text,
  "path" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "platform_error_log_occurred_idx" ON "platform_error_log" USING btree ("occurred_at");
--> statement-breakpoint
REVOKE ALL ON "platform_error_log" FROM PUBLIC;
GRANT SELECT, INSERT ON "platform_error_log" TO beaconhs_app, beaconhs_super;
GRANT SELECT ON "platform_error_log" TO beaconhs_backup;
