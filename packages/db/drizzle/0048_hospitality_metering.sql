-- Forward-only hospitality utility Metering module.
CREATE TABLE "hospitality_meters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "property_id" uuid NOT NULL,
  "name" text NOT NULL,
  "meter_type" text NOT NULL,
  "location" text NOT NULL,
  "serial_number" text NOT NULL,
  "mpan" text,
  "measurement_unit" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "notes" text,
  "installed_at" date NOT NULL,
  "opening_reading" numeric(20,6) NOT NULL,
  "previous_meter_id" uuid,
  "replacement_date" date,
  "created_by_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "hospitality_meters_property_fk" FOREIGN KEY ("tenant_id","property_id") REFERENCES "hospitality_properties"("tenant_id","id"),
  CONSTRAINT "hospitality_meters_creator_fk" FOREIGN KEY ("tenant_id","created_by_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "hospitality_meters_type_check" CHECK ("meter_type" IN ('electricity','gas','water','custom')),
  CONSTRAINT "hospitality_meters_identity_check" CHECK (length(trim("name")) BETWEEN 1 AND 200 AND length(trim("location")) BETWEEN 1 AND 200 AND length(trim("serial_number")) BETWEEN 1 AND 200 AND length(trim("measurement_unit")) BETWEEN 1 AND 50),
  CONSTRAINT "hospitality_meters_mpan_check" CHECK ("mpan" IS NULL OR length(trim("mpan")) BETWEEN 1 AND 100),
  CONSTRAINT "hospitality_meters_opening_check" CHECK ("opening_reading" >= 0),
  CONSTRAINT "hospitality_meters_replacement_check" CHECK (("previous_meter_id" IS NULL AND "replacement_date" IS NULL) OR ("previous_meter_id" IS NOT NULL AND "replacement_date" IS NOT NULL))
);
CREATE UNIQUE INDEX "hospitality_meters_tenant_id_id_ux" ON "hospitality_meters" ("tenant_id","id");
CREATE UNIQUE INDEX "hospitality_meters_property_id_id_ux" ON "hospitality_meters" ("tenant_id","property_id","id");
CREATE UNIQUE INDEX "hospitality_meters_property_serial_ux" ON "hospitality_meters" ("tenant_id","property_id","serial_number");
CREATE INDEX "hospitality_meters_property_search_idx" ON "hospitality_meters" ("tenant_id","property_id","name","serial_number");
CREATE INDEX "hospitality_meters_mpan_idx" ON "hospitality_meters" ("tenant_id","mpan");
ALTER TABLE "hospitality_meters" ADD CONSTRAINT "hospitality_meters_previous_fk" FOREIGN KEY ("tenant_id","property_id","previous_meter_id") REFERENCES "hospitality_meters"("tenant_id","property_id","id");

CREATE TABLE "hospitality_meter_tariffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "meter_id" uuid NOT NULL,
  "unit_cost" numeric(16,6) NOT NULL,
  "currency" text NOT NULL,
  "effective_from" timestamptz NOT NULL,
  "created_by_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "hospitality_meter_tariffs_meter_fk" FOREIGN KEY ("tenant_id","meter_id") REFERENCES "hospitality_meters"("tenant_id","id") ON DELETE CASCADE,
  CONSTRAINT "hospitality_meter_tariffs_creator_fk" FOREIGN KEY ("tenant_id","created_by_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "hospitality_meter_tariffs_cost_check" CHECK ("unit_cost" >= 0),
  CONSTRAINT "hospitality_meter_tariffs_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX "hospitality_meter_tariffs_tenant_id_id_ux" ON "hospitality_meter_tariffs" ("tenant_id","id");
CREATE UNIQUE INDEX "hospitality_meter_tariffs_meter_id_id_ux" ON "hospitality_meter_tariffs" ("tenant_id","meter_id","id");
CREATE UNIQUE INDEX "hospitality_meter_tariffs_effective_ux" ON "hospitality_meter_tariffs" ("tenant_id","meter_id","effective_from");
CREATE INDEX "hospitality_meter_tariffs_timeline_idx" ON "hospitality_meter_tariffs" ("tenant_id","meter_id","effective_from");

CREATE TABLE "hospitality_meter_readings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "meter_id" uuid NOT NULL,
  "reading_value" numeric(20,6) NOT NULL,
  "read_at" timestamptz NOT NULL,
  "reading_type" text DEFAULT 'normal' NOT NULL,
  "replaces_reading_id" uuid,
  "notes" text,
  "submitted_by_id" uuid NOT NULL,
  "consumption" numeric(20,6),
  "tariff_id" uuid,
  "unit_cost_snapshot" numeric(16,6),
  "currency_snapshot" text,
  "estimated_expenditure" numeric(20,6),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "hospitality_meter_readings_meter_fk" FOREIGN KEY ("tenant_id","meter_id") REFERENCES "hospitality_meters"("tenant_id","id") ON DELETE CASCADE,
  CONSTRAINT "hospitality_meter_readings_author_fk" FOREIGN KEY ("tenant_id","submitted_by_id") REFERENCES "tenant_users"("tenant_id","id"),
  CONSTRAINT "hospitality_meter_readings_value_check" CHECK ("reading_value" >= 0),
  CONSTRAINT "hospitality_meter_readings_type_check" CHECK ("reading_type" IN ('normal','corrected','reset','opening')),
  CONSTRAINT "hospitality_meter_readings_correction_check" CHECK (("reading_type" = 'corrected') = ("replaces_reading_id" IS NOT NULL)),
  CONSTRAINT "hospitality_meter_readings_consumption_check" CHECK ("consumption" IS NULL OR "consumption" >= 0),
  CONSTRAINT "hospitality_meter_readings_cost_snapshot_check" CHECK (("tariff_id" IS NULL AND "unit_cost_snapshot" IS NULL AND "currency_snapshot" IS NULL AND "estimated_expenditure" IS NULL) OR ("tariff_id" IS NOT NULL AND "unit_cost_snapshot" IS NOT NULL AND "currency_snapshot" IS NOT NULL AND "estimated_expenditure" IS NOT NULL))
);
CREATE UNIQUE INDEX "hospitality_meter_readings_tenant_id_id_ux" ON "hospitality_meter_readings" ("tenant_id","id");
CREATE UNIQUE INDEX "hospitality_meter_readings_meter_id_id_ux" ON "hospitality_meter_readings" ("tenant_id","meter_id","id");
CREATE INDEX "hospitality_meter_readings_timeline_idx" ON "hospitality_meter_readings" ("tenant_id","meter_id","read_at","id");
CREATE INDEX "hospitality_meter_readings_submitter_idx" ON "hospitality_meter_readings" ("tenant_id","submitted_by_id");
ALTER TABLE "hospitality_meter_readings" ADD CONSTRAINT "hospitality_meter_readings_replaced_fk" FOREIGN KEY ("tenant_id","meter_id","replaces_reading_id") REFERENCES "hospitality_meter_readings"("tenant_id","meter_id","id");
ALTER TABLE "hospitality_meter_readings" ADD CONSTRAINT "hospitality_meter_readings_tariff_fk" FOREIGN KEY ("tenant_id","meter_id","tariff_id") REFERENCES "hospitality_meter_tariffs"("tenant_id","meter_id","id");
