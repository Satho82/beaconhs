-- V1.4 Work 03: forward-only tenant operational defaults and configuration
-- governance. Existing tenant rows receive safe, explicit defaults. This
-- migration neither rewrites historic monetary snapshots nor migrates forms.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS operational_locale text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS operational_timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS number_format text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS default_currency_code text NOT NULL DEFAULT 'USD';

ALTER TABLE tenants
  ADD CONSTRAINT tenants_operational_locale_check
    CHECK (operational_locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$') NOT VALID,
  ADD CONSTRAINT tenants_date_format_check
    CHECK (date_format IN ('short', 'medium', 'long')) NOT VALID,
  ADD CONSTRAINT tenants_number_format_check
    CHECK (number_format IN ('standard', 'compact')) NOT VALID,
  ADD CONSTRAINT tenants_default_currency_code_check
    CHECK (default_currency_code ~ '^[A-Z]{3}$') NOT VALID;
ALTER TABLE tenants VALIDATE CONSTRAINT tenants_operational_locale_check;
ALTER TABLE tenants VALIDATE CONSTRAINT tenants_date_format_check;
ALTER TABLE tenants VALIDATE CONSTRAINT tenants_number_format_check;
ALTER TABLE tenants VALIDATE CONSTRAINT tenants_default_currency_code_check;

DO $$ BEGIN
  CREATE TYPE configuration_lifecycle_state AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS configuration_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_type text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  state configuration_lifecycle_state NOT NULL DEFAULT 'draft',
  created_by_user_id text REFERENCES "user"(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT configuration_masters_domain_key_ux UNIQUE (domain_type, key)
);

CREATE TABLE IF NOT EXISTS configuration_master_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id uuid NOT NULL REFERENCES configuration_masters(id) ON DELETE CASCADE,
  version integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  changelog text,
  state configuration_lifecycle_state NOT NULL DEFAULT 'draft',
  created_by_user_id text REFERENCES "user"(id),
  published_at timestamptz,
  published_by_user_id text REFERENCES "user"(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT configuration_master_versions_master_version_ux UNIQUE (master_id, version)
);
CREATE INDEX IF NOT EXISTS configuration_master_versions_master_state_idx
  ON configuration_master_versions (master_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS configuration_master_versions_master_id_id_ux
  ON configuration_master_versions (master_id, id);

CREATE TABLE IF NOT EXISTS tenant_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain_type text NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  source_master_id uuid REFERENCES configuration_masters(id),
  source_master_version_id uuid REFERENCES configuration_master_versions(id),
  state configuration_lifecycle_state NOT NULL DEFAULT 'draft',
  created_by_user_id text REFERENCES "user"(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tenant_configurations_domain_key_ux UNIQUE (tenant_id, domain_type, key),
  CONSTRAINT tenant_configurations_tenant_id_id_ux UNIQUE (tenant_id, id),
  CONSTRAINT tenant_configurations_source_lineage_check CHECK (
    (source_master_id IS NULL AND source_master_version_id IS NULL)
    OR (source_master_id IS NOT NULL AND source_master_version_id IS NOT NULL)
  ),
  CONSTRAINT tenant_configurations_source_master_version_fk
    FOREIGN KEY (source_master_id, source_master_version_id)
    REFERENCES configuration_master_versions (master_id, id)
);
CREATE INDEX IF NOT EXISTS tenant_configurations_tenant_state_idx
  ON tenant_configurations (tenant_id, state);

CREATE TABLE IF NOT EXISTS tenant_configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  configuration_id uuid NOT NULL,
  version integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  changelog text,
  state configuration_lifecycle_state NOT NULL DEFAULT 'draft',
  source_master_version_id uuid REFERENCES configuration_master_versions(id),
  created_by_user_id text REFERENCES "user"(id),
  published_at timestamptz,
  published_by_user_id text REFERENCES "user"(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_configuration_versions_configuration_version_ux UNIQUE (configuration_id, version),
  CONSTRAINT tenant_configuration_versions_tenant_configuration_id_ux UNIQUE (tenant_id, configuration_id, id),
  CONSTRAINT tenant_configuration_versions_tenant_configuration_fk
    FOREIGN KEY (tenant_id, configuration_id)
    REFERENCES tenant_configurations (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tenant_configuration_versions_source_master_version_fk
    FOREIGN KEY (source_master_version_id)
    REFERENCES configuration_master_versions (id)
);

CREATE TABLE IF NOT EXISTS tenant_configuration_property_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  configuration_id uuid NOT NULL,
  property_id uuid NOT NULL,
  created_by_user_id text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_configuration_property_applicability_ux UNIQUE (tenant_id, configuration_id, property_id),
  CONSTRAINT tenant_configuration_applicability_configuration_fk
    FOREIGN KEY (tenant_id, configuration_id)
    REFERENCES tenant_configurations (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tenant_configuration_applicability_property_fk
    FOREIGN KEY (tenant_id, property_id)
    REFERENCES hospitality_properties (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS tenant_configuration_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  configuration_id uuid NOT NULL,
  form_template_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_configuration_form_templates_configuration_ux UNIQUE (tenant_id, configuration_id),
  CONSTRAINT tenant_configuration_form_templates_template_ux UNIQUE (tenant_id, form_template_id),
  CONSTRAINT tenant_configuration_form_templates_configuration_fk
    FOREIGN KEY (tenant_id, configuration_id)
    REFERENCES tenant_configurations (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tenant_configuration_form_templates_template_fk
    FOREIGN KEY (tenant_id, form_template_id)
    REFERENCES form_templates (tenant_id, id)
);

-- Published version rows are immutable. Archive a configuration identity or
-- publish a new version instead of rewriting history.
CREATE OR REPLACE FUNCTION v14_reject_published_configuration_version_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'published' THEN
    RAISE EXCEPTION 'Published configuration versions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS configuration_master_versions_published_immutable ON configuration_master_versions;
CREATE TRIGGER configuration_master_versions_published_immutable
  BEFORE UPDATE OR DELETE ON configuration_master_versions
  FOR EACH ROW EXECUTE FUNCTION v14_reject_published_configuration_version_mutation();
DROP TRIGGER IF EXISTS tenant_configuration_versions_published_immutable ON tenant_configuration_versions;
CREATE TRIGGER tenant_configuration_versions_published_immutable
  BEFORE UPDATE OR DELETE ON tenant_configuration_versions
  FOR EACH ROW EXECUTE FUNCTION v14_reject_published_configuration_version_mutation();

ALTER TABLE tenant_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_configurations FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_configuration_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_configuration_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_configuration_property_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_configuration_property_applicability FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_configuration_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_configuration_form_templates FORCE ROW LEVEL SECURITY;
