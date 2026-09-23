ALTER TABLE "report_schedules" ADD COLUMN "property_context_id" uuid;
CREATE INDEX "report_schedules_property_context_idx"
  ON "report_schedules" USING btree ("tenant_id","property_context_id");
ALTER TABLE "report_schedules"
  ADD CONSTRAINT "report_schedules_tenant_property_context_fk"
  FOREIGN KEY ("tenant_id","property_context_id")
  REFERENCES "public"."hospitality_properties"("tenant_id","id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
