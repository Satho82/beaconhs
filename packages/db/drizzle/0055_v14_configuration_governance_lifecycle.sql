-- Work 04: prevent duplicate tenant adoption of the same immutable platform
-- source version. Direct tenant configurations retain NULL lineage and remain
-- unaffected. This migration is additive and does not rewrite historic data.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_configurations_adopted_source_ux
  ON tenant_configurations (tenant_id, source_master_version_id)
  WHERE source_master_version_id IS NOT NULL AND deleted_at IS NULL;

-- Work 03 exposed explicit date representations while 0054 accepted only the
-- historic values. Keep historic tenant records valid and accept all current
-- persisted choices without data rewrite.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_date_format_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_date_format_check
  CHECK (date_format IN (
    'short', 'medium', 'long', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD',
    'DD MMM YYYY', 'D MMM YYYY', 'DD MMMM YYYY', 'MMMM D, YYYY'
  )) NOT VALID;
ALTER TABLE tenants VALIDATE CONSTRAINT tenants_date_format_check;
