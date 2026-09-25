#!/usr/bin/env bash
set -euo pipefail

export UVANOO_CYCAS_SEED_TARGET=development
export UVANOO_CYCAS_SEED_CONFIRM=SEED_CYCAS_HOSPITALITY_DEVELOPMENT
export UVANOO_CYCAS_SEED_ANCHOR=2026-09-17T12:00:00.000Z
export NODE_ENV=development

pnpm --filter @beaconhs/db seed:cycas-demo
pnpm --filter @beaconhs/db seed:cycas-demo

psql "$SUPERADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  cycas_id uuid;
  property_count integer;
  dangling_qr integer;
  row_counts record;
BEGIN
  SELECT id INTO STRICT cycas_id FROM tenants WHERE slug = 'cycas-hospitality-demo';
  SELECT count(*) INTO property_count
  FROM hospitality_properties
  WHERE tenant_id = cycas_id AND deleted_at IS NULL;
  IF property_count <> 2 THEN
    RAISE EXCEPTION 'expected two Cycas properties, found %', property_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM hospitality_properties
    WHERE tenant_id = cycas_id AND name = 'Cycas Hospitality' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'management company was incorrectly created as a property';
  END IF;
  SELECT count(*) INTO dangling_qr
  FROM qr_targets q
  LEFT JOIN hospitality_rooms r ON r.tenant_id = q.tenant_id AND r.id = q.room_id
  WHERE q.tenant_id = cycas_id AND q.room_id IS NOT NULL AND r.id IS NULL;
  IF dangling_qr <> 0 THEN
    RAISE EXCEPTION 'found % room QR targets without rooms', dangling_qr;
  END IF;

  FOR row_counts IN
    WITH property_counts AS (
      SELECT
        p.name,
        (SELECT count(*)
         FROM hospitality_rooms r
         JOIN hospitality_floors f ON f.tenant_id = r.tenant_id AND f.id = r.floor_id
         JOIN hospitality_buildings b ON b.tenant_id = f.tenant_id AND b.id = f.building_id
         WHERE b.property_id = p.id) AS rooms,
        (SELECT count(*)
         FROM maintenance_issues m
         JOIN hospitality_rooms r ON r.tenant_id = m.tenant_id AND r.id = m.room_id
         JOIN hospitality_floors f ON f.tenant_id = r.tenant_id AND f.id = r.floor_id
         JOIN hospitality_buildings b ON b.tenant_id = f.tenant_id AND b.id = f.building_id
         WHERE b.property_id = p.id) AS maintenance,
        (SELECT count(*)
         FROM operational_task_occurrences o
         JOIN operational_task_schedules s ON s.tenant_id = o.tenant_id AND s.id = o.schedule_id
         WHERE s.property_id = p.id)
        + (SELECT count(*) FROM inspection_records i
           WHERE i.tenant_id = cycas_id AND i.metadata->>'propertyId' = p.id::text)
        + (SELECT count(*) FROM incidents i
           JOIN org_units u ON u.tenant_id = i.tenant_id AND u.id = i.site_org_unit_id
           WHERE u.metadata->>'hospitalityPropertyId' = p.id::text) AS operations,
        (SELECT count(*) FROM compliance_obligations c
         WHERE c.tenant_id = cycas_id AND c.source_key LIKE 'cycas-hs-%'
           AND c.target_ref->>'propertyId' = p.id::text) AS hs_topics
      FROM hospitality_properties p
      WHERE p.tenant_id = cycas_id AND p.deleted_at IS NULL
    )
    SELECT * FROM property_counts
  LOOP
    IF row_counts.rooms <> 33 OR row_counts.maintenance <> 12
       OR row_counts.operations <> 21 OR row_counts.hs_topics <> 22 THEN
      RAISE EXCEPTION 'unexpected counts for %: rooms %, maintenance %, operations %, H&S %',
        row_counts.name, row_counts.rooms, row_counts.maintenance,
        row_counts.operations, row_counts.hs_topics;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM "user" WHERE email LIKE '%@cycas.demo.uvanoo.invalid') <> 18 THEN
    RAISE EXCEPTION 'unexpected Cycas user count';
  END IF;
  IF (SELECT count(*) FROM people WHERE tenant_id = cycas_id) <> 18 THEN
    RAISE EXCEPTION 'unexpected Cycas people count';
  END IF;
  IF (SELECT count(*) FROM qr_targets WHERE tenant_id = cycas_id) <> 66 THEN
    RAISE EXCEPTION 'unexpected Cycas QR target count';
  END IF;
END $$;
SQL
