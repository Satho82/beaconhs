ALTER TYPE "public"."maintenance_issue_source" ADD VALUE IF NOT EXISTS 'front_office';--> statement-breakpoint
ALTER TYPE "public"."maintenance_issue_source" ADD VALUE IF NOT EXISTS 'manager';--> statement-breakpoint
ALTER TYPE "public"."maintenance_issue_source" ADD VALUE IF NOT EXISTS 'engineering';--> statement-breakpoint
ALTER TYPE "public"."maintenance_issue_source" ADD VALUE IF NOT EXISTS 'staff_qr';
