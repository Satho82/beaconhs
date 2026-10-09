-- No cache, data rewrite, role creation, login, or BYPASSRLS permission.
-- Run by the existing NOLOGIN migration owner in the migration transaction.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND NOT rolcanlogin AND NOT rolsuper
      AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('people', 'people_assignments', 'org_units', 'hospitality_properties')
        AND c.relowner <> current_user::regrole)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
      WHERE nspname = 'security' AND nspowner <> current_user::regrole)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'security' AND p.proname IN ('person_allows_scope', 'lock_person_provenance_write')
        AND p.proowner <> current_user::regrole) THEN
    RAISE EXCEPTION 'People provenance requires the non-login, non-bypass application owner';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS security;
REVOKE ALL ON SCHEMA security FROM PUBLIC;

-- The existing migration owner already controls these tables. Grant no new
-- role membership or table privileges. Its extra authority is SELECT-only,
-- explicitly tenant-bound, and unreachable by runtime except this boolean.
-- FORCE RLS remains enabled; the resolver never changes tenant or scope GUCs.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS person_provenance_owner_read ON public.people_assignments';
  EXECUTE format($policy$CREATE POLICY person_provenance_owner_read ON public.people_assignments
    FOR SELECT TO %I USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$policy$, current_user);
  EXECUTE 'DROP POLICY IF EXISTS person_provenance_owner_read ON public.org_units';
  EXECUTE format($policy$CREATE POLICY person_provenance_owner_read ON public.org_units
    FOR SELECT TO %I USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$policy$, current_user);
END
$$;

CREATE OR REPLACE FUNCTION security.person_allows_scope(candidate_tenant_id uuid, candidate_person_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET row_security = on
AS $$
DECLARE
  configured_tenant_id uuid;
  scope_mode text;
  property_ids jsonb;
BEGIN
  BEGIN
    configured_tenant_id := nullif(current_setting('app.tenant_id', true), '')::uuid;
    scope_mode := current_setting('app.action_scope_mode', true);
    property_ids := coalesce(nullif(current_setting('app.action_property_ids', true), ''), '[]')::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  IF candidate_tenant_id IS NULL OR candidate_person_id IS NULL OR configured_tenant_id IS NULL
    OR candidate_tenant_id <> configured_tenant_id THEN RETURN false; END IF;
  IF scope_mode = 'tenant' THEN RETURN true; END IF;
  IF scope_mode IS NULL OR scope_mode NOT IN ('legacy', 'property')
    OR jsonb_typeof(property_ids) <> 'array' THEN RETURN false; END IF;

  -- VOLATILE obtains a fresh snapshot per SQL command only at READ COMMITTED.
  -- Old fixed snapshots must fail, including after a provenance writer commits.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '0A000',
      MESSAGE = 'Restricted People access requires READ COMMITTED isolation';
  END IF;
  -- Writers take the same transaction lock. A waiting reader obtains fresh
  -- provenance AFTER commit. A lock-holding reader prevents revocation until
  -- its transaction ends, including when it uses SELECT FOR UPDATE.
  PERFORM pg_advisory_xact_lock(hashtextextended('beaconhs:person-provenance:' || candidate_tenant_id::text, 0));
  IF scope_mode = 'legacy' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.people_assignments assignment
      LEFT JOIN public.org_units unit
        ON unit.tenant_id = assignment.tenant_id AND unit.id = assignment.org_unit_id
      WHERE assignment.tenant_id = candidate_tenant_id AND assignment.person_id = candidate_person_id
        AND assignment.valid_from <= current_date
        AND (assignment.valid_to IS NULL OR assignment.valid_to >= current_date)
        -- Only an absent mapping is positive non-property provenance. Empty,
        -- null, malformed, foreign and deleted mappings fail closed.
        AND (unit.id IS NULL OR jsonb_typeof(unit.metadata) IS DISTINCT FROM 'object'
          OR unit.metadata ? 'hospitalityPropertyId')
    );
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.people_assignments assignment
    JOIN public.org_units unit
      ON unit.tenant_id = assignment.tenant_id AND unit.id = assignment.org_unit_id
    JOIN public.hospitality_properties property_scope
      ON property_scope.tenant_id = unit.tenant_id
      AND property_scope.id::text = unit.metadata->>'hospitalityPropertyId'
      AND property_scope.deleted_at IS NULL
    WHERE assignment.tenant_id = candidate_tenant_id AND assignment.person_id = candidate_person_id
      AND assignment.valid_from <= current_date
      AND (assignment.valid_to IS NULL OR assignment.valid_to >= current_date)
      AND property_ids ? (unit.metadata->>'hospitalityPropertyId')
  );
END
$$;
REVOKE ALL ON FUNCTION security.person_allows_scope(uuid, uuid) FROM PUBLIC;

-- The writer fence uses invoker security. After waiting, restricted direct
-- assignment writers must prove site visibility again with a fresh snapshot.
CREATE OR REPLACE FUNCTION security.lock_person_provenance_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE old_tenant uuid; new_tenant uuid; lock_tenant uuid; scope_mode text;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_tenant := OLD.tenant_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_tenant := NEW.tenant_id; END IF;
  FOR lock_tenant IN SELECT DISTINCT tenant_id
    FROM unnest(ARRAY[old_tenant, new_tenant]) AS ids(tenant_id)
    WHERE tenant_id IS NOT NULL ORDER BY tenant_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('beaconhs:person-provenance:' || lock_tenant::text, 0));
  END LOOP;
  scope_mode := current_setting('app.action_scope_mode', true);
  IF scope_mode IN ('legacy', 'property') AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION USING ERRCODE = '0A000',
        MESSAGE = 'Restricted provenance writes require READ COMMITTED isolation';
    END IF;
    IF TG_TABLE_NAME = 'people_assignments' THEN
      -- Foreign-key cascades follow an already-authorised parent mutation and
      -- hold its same tenant lock. The parent site may already be deleted.
      IF NOT (TG_OP = 'DELETE' AND pg_trigger_depth() > 1) THEN
        IF TG_OP <> 'INSERT' AND NOT EXISTS (SELECT 1 FROM public.org_units
          WHERE tenant_id = OLD.tenant_id AND id = OLD.org_unit_id) THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Assignment provenance is outside the current scope';
        END IF;
        IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.org_units
          WHERE tenant_id = NEW.tenant_id AND id = NEW.org_unit_id) THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Assignment provenance is outside the current scope';
        END IF;
        -- An assignment must not manufacture visibility of an otherwise hidden
        -- Person. Check both identities before changing the authoritative link.
        IF TG_OP <> 'INSERT' AND NOT EXISTS (SELECT 1 FROM public.people
          WHERE tenant_id = OLD.tenant_id AND id = OLD.person_id) THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Person is outside the current scope';
        END IF;
        IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.people
          WHERE tenant_id = NEW.tenant_id AND id = NEW.person_id) THEN
          RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Person is outside the current scope';
        END IF;
      END IF;
    ELSIF TG_TABLE_NAME = 'org_units' THEN
      IF TG_OP <> 'INSERT' AND NOT (TG_OP = 'DELETE' AND pg_trigger_depth() > 1)
        AND NOT EXISTS (SELECT 1 FROM public.org_units WHERE tenant_id = OLD.tenant_id AND id = OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Site provenance is outside the current scope';
      END IF;
      -- Recheck the new mapping against active properties AFTER any wait too.
      IF TG_OP <> 'DELETE' AND scope_mode = 'property'
        AND NOT EXISTS (SELECT 1 FROM public.hospitality_properties
          WHERE tenant_id = NEW.tenant_id AND id::text = NEW.metadata->>'hospitalityPropertyId' AND deleted_at IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Site provenance is outside the current scope';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION security.lock_person_provenance_write() FROM PUBLIC;

DROP TRIGGER IF EXISTS people_assignments_person_provenance_lock ON public.people_assignments;
CREATE TRIGGER people_assignments_person_provenance_lock BEFORE INSERT OR UPDATE OR DELETE ON public.people_assignments
FOR EACH ROW EXECUTE FUNCTION security.lock_person_provenance_write();
DROP TRIGGER IF EXISTS org_units_person_provenance_lock ON public.org_units;
CREATE TRIGGER org_units_person_provenance_lock BEFORE INSERT OR UPDATE OR DELETE ON public.org_units
FOR EACH ROW EXECUTE FUNCTION security.lock_person_provenance_write();
DROP TRIGGER IF EXISTS properties_person_provenance_lock ON public.hospitality_properties;
CREATE TRIGGER properties_person_provenance_lock BEFORE INSERT OR UPDATE OR DELETE ON public.hospitality_properties
FOR EACH ROW EXECUTE FUNCTION security.lock_person_provenance_write();
