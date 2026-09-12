-- Keep the existing task-template/schedule split: a reusable template may be
-- scheduled at a property, while the occurrence is the immutable operational
-- record consumed by diary, sign-off, and future escalation views.
ALTER TABLE "operational_task_schedules" ADD COLUMN "assigned_to_tenant_user_id" uuid;
ALTER TABLE "operational_task_schedules" ADD CONSTRAINT "operational_task_schedules_tenant_assignee_fk" FOREIGN KEY ("tenant_id","assigned_to_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id");
ALTER TABLE "operational_task_occurrences" ADD COLUMN "completed_by_tenant_user_id" uuid;
ALTER TABLE "operational_task_occurrences" ADD COLUMN "completion_notes" text;
ALTER TABLE "operational_task_occurrences" ADD CONSTRAINT "operational_task_occurrences_tenant_assignee_fk" FOREIGN KEY ("tenant_id","assigned_to_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id");
ALTER TABLE "operational_task_occurrences" ADD CONSTRAINT "operational_task_occurrences_tenant_completer_fk" FOREIGN KEY ("tenant_id","completed_by_tenant_user_id") REFERENCES "tenant_users"("tenant_id","id");
