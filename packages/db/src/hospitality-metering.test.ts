import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  hospitalityMeterChildPredicate,
  hospitalityMeterPropertyPredicate,
} from './action-property-policy'
import { RLS_POLICY_SQL, TENANT_SCOPED_TABLES } from './rls'

const migration = readFileSync(
  new URL('../drizzle/0048_hospitality_metering.sql', import.meta.url),
  'utf8',
)
const journal = readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
const fixture = readFileSync(
  new URL('./hospitality-metering-rls.integration.sql', import.meta.url),
  'utf8',
)

describe('Hospitality Metering database foundation', () => {
  it('is sequential and contains lifecycle, tariff, reading and integrity foundations', () => {
    expect(journal).toContain('"tag": "0048_hospitality_metering"')
    for (const value of [
      'CREATE TABLE "hospitality_meters"',
      'CREATE TABLE "hospitality_meter_tariffs"',
      'CREATE TABLE "hospitality_meter_readings"',
      '"hospitality_meters_property_fk"',
      '"hospitality_meters_previous_fk"',
      '"hospitality_meter_readings_replaced_fk"',
      '"hospitality_meter_readings_tariff_fk"',
      '"hospitality_meters_property_serial_ux"',
      '"hospitality_meters_mpan_idx"',
      '"hospitality_meter_tariffs_effective_ux"',
    ])
      expect(migration).toContain(value)
  })
  it('enforces validation constraints for identity, readings and immutable cost snapshots', () => {
    expect(migration).toContain('"hospitality_meters_type_check"')
    expect(migration).toContain('"hospitality_meters_mpan_check"')
    expect(migration).toContain('"hospitality_meter_readings_value_check"')
    expect(migration).toContain('"hospitality_meter_readings_consumption_check"')
    expect(migration).toContain('"hospitality_meter_readings_cost_snapshot_check"')
  })
  it('installs tenant and property RLS on all three tables', () => {
    for (const table of [
      'hospitality_meters',
      'hospitality_meter_tariffs',
      'hospitality_meter_readings',
    ]) {
      expect(TENANT_SCOPED_TABLES).toContain(table)
      expect(RLS_POLICY_SQL(table)).toContain('FORCE ROW LEVEL SECURITY')
    }
    expect(hospitalityMeterPropertyPredicate()).toContain('hospitality_meters.property_id')
    expect(hospitalityMeterPropertyPredicate()).toContain('app.action_property_ids')
    expect(hospitalityMeterChildPredicate('hospitality_meter_readings')).toContain(
      'FROM hospitality_meters',
    )
    expect(RLS_POLICY_SQL('hospitality_meter_readings')).toContain(
      'm.id=hospitality_meter_readings.meter_id',
    )
  })
  it('retains rollback-only production-role isolation proof', () => {
    expect(fixture).toContain('SET LOCAL ROLE uvanoo_metering_test')
    expect(fixture).toContain('pg_temp.expect_denied')
    expect(fixture).toContain("set_config('app.action_property_ids','[]'")
    expect(fixture).toContain('ROLLBACK;')
  })
})
