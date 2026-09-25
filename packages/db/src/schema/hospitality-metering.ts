import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'
import { tenants, tenantUsers } from './core'
import { hospitalityProperties } from './hospitality'

export const hospitalityMeters = pgTable(
  'hospitality_meters',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: uuid('property_id').notNull(),
    name: text('name').notNull(),
    meterType: text('meter_type').$type<'electricity' | 'gas' | 'water' | 'custom'>().notNull(),
    location: text('location').notNull(),
    serialNumber: text('serial_number').notNull(),
    mpan: text('mpan'),
    measurementUnit: text('measurement_unit').notNull(),
    active: boolean('active').default(true).notNull(),
    notes: text('notes'),
    installedAt: date('installed_at').notNull(),
    openingReading: numeric('opening_reading', {
      precision: 20,
      scale: 6,
      mode: 'number',
    }).notNull(),
    previousMeterId: uuid('previous_meter_id'),
    replacementDate: date('replacement_date'),
    createdById: uuid('created_by_id').notNull(),
    ...timestamps,
  },
  (t) => ({
    tenantIdId: uniqueIndex('hospitality_meters_tenant_id_id_ux').on(t.tenantId, t.id),
    propertyIdId: uniqueIndex('hospitality_meters_property_id_id_ux').on(
      t.tenantId,
      t.propertyId,
      t.id,
    ),
    serial: uniqueIndex('hospitality_meters_property_serial_ux').on(
      t.tenantId,
      t.propertyId,
      t.serialNumber,
    ),
    propertySearch: index('hospitality_meters_property_search_idx').on(
      t.tenantId,
      t.propertyId,
      t.name,
      t.serialNumber,
    ),
    mpanSearch: index('hospitality_meters_mpan_idx').on(t.tenantId, t.mpan),
    property: foreignKey({
      name: 'hospitality_meters_property_fk',
      columns: [t.tenantId, t.propertyId],
      foreignColumns: [hospitalityProperties.tenantId, hospitalityProperties.id],
    }),
    creator: foreignKey({
      name: 'hospitality_meters_creator_fk',
      columns: [t.tenantId, t.createdById],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    previous: foreignKey({
      name: 'hospitality_meters_previous_fk',
      columns: [t.tenantId, t.propertyId, t.previousMeterId],
      foreignColumns: [t.tenantId, t.propertyId, t.id],
    }),
    typeCheck: check(
      'hospitality_meters_type_check',
      sql`${t.meterType} IN ('electricity','gas','water','custom')`,
    ),
    identityCheck: check(
      'hospitality_meters_identity_check',
      sql`length(trim(${t.name})) BETWEEN 1 AND 200 AND length(trim(${t.location})) BETWEEN 1 AND 200 AND length(trim(${t.serialNumber})) BETWEEN 1 AND 200 AND length(trim(${t.measurementUnit})) BETWEEN 1 AND 50`,
    ),
    mpanCheck: check(
      'hospitality_meters_mpan_check',
      sql`${t.mpan} IS NULL OR length(trim(${t.mpan})) BETWEEN 1 AND 100`,
    ),
    openingCheck: check('hospitality_meters_opening_check', sql`${t.openingReading} >= 0`),
    replacementCheck: check(
      'hospitality_meters_replacement_check',
      sql`(${t.previousMeterId} IS NULL AND ${t.replacementDate} IS NULL) OR (${t.previousMeterId} IS NOT NULL AND ${t.replacementDate} IS NOT NULL)`,
    ),
  }),
)

export const hospitalityMeterTariffs = pgTable(
  'hospitality_meter_tariffs',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    meterId: uuid('meter_id').notNull(),
    unitCost: numeric('unit_cost', { precision: 16, scale: 6, mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    createdById: uuid('created_by_id').notNull(),
    ...timestamps,
  },
  (t) => ({
    tenantIdId: uniqueIndex('hospitality_meter_tariffs_tenant_id_id_ux').on(t.tenantId, t.id),
    meterIdId: uniqueIndex('hospitality_meter_tariffs_meter_id_id_ux').on(
      t.tenantId,
      t.meterId,
      t.id,
    ),
    effective: uniqueIndex('hospitality_meter_tariffs_effective_ux').on(
      t.tenantId,
      t.meterId,
      t.effectiveFrom,
    ),
    timeline: index('hospitality_meter_tariffs_timeline_idx').on(
      t.tenantId,
      t.meterId,
      t.effectiveFrom,
    ),
    meter: foreignKey({
      name: 'hospitality_meter_tariffs_meter_fk',
      columns: [t.tenantId, t.meterId],
      foreignColumns: [hospitalityMeters.tenantId, hospitalityMeters.id],
    }).onDelete('cascade'),
    creator: foreignKey({
      name: 'hospitality_meter_tariffs_creator_fk',
      columns: [t.tenantId, t.createdById],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    costCheck: check('hospitality_meter_tariffs_cost_check', sql`${t.unitCost} >= 0`),
    currencyCheck: check(
      'hospitality_meter_tariffs_currency_check',
      sql`${t.currency} ~ '^[A-Z]{3}$'`,
    ),
  }),
)

export const hospitalityMeterReadings = pgTable(
  'hospitality_meter_readings',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    meterId: uuid('meter_id').notNull(),
    readingValue: numeric('reading_value', { precision: 20, scale: 6, mode: 'number' }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull(),
    readingType: text('reading_type')
      .$type<'normal' | 'corrected' | 'reset' | 'opening'>()
      .default('normal')
      .notNull(),
    replacesReadingId: uuid('replaces_reading_id'),
    notes: text('notes'),
    submittedById: uuid('submitted_by_id').notNull(),
    consumption: numeric('consumption', { precision: 20, scale: 6, mode: 'number' }),
    tariffId: uuid('tariff_id'),
    unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 16, scale: 6, mode: 'number' }),
    currencySnapshot: text('currency_snapshot'),
    estimatedExpenditure: numeric('estimated_expenditure', {
      precision: 20,
      scale: 6,
      mode: 'number',
    }),
    ...timestamps,
  },
  (t) => ({
    tenantIdId: uniqueIndex('hospitality_meter_readings_tenant_id_id_ux').on(t.tenantId, t.id),
    meterIdId: uniqueIndex('hospitality_meter_readings_meter_id_id_ux').on(
      t.tenantId,
      t.meterId,
      t.id,
    ),
    timeline: index('hospitality_meter_readings_timeline_idx').on(
      t.tenantId,
      t.meterId,
      t.readAt,
      t.id,
    ),
    submitter: index('hospitality_meter_readings_submitter_idx').on(t.tenantId, t.submittedById),
    meter: foreignKey({
      name: 'hospitality_meter_readings_meter_fk',
      columns: [t.tenantId, t.meterId],
      foreignColumns: [hospitalityMeters.tenantId, hospitalityMeters.id],
    }).onDelete('cascade'),
    author: foreignKey({
      name: 'hospitality_meter_readings_author_fk',
      columns: [t.tenantId, t.submittedById],
      foreignColumns: [tenantUsers.tenantId, tenantUsers.id],
    }),
    replaced: foreignKey({
      name: 'hospitality_meter_readings_replaced_fk',
      columns: [t.tenantId, t.meterId, t.replacesReadingId],
      foreignColumns: [t.tenantId, t.meterId, t.id],
    }),
    tariff: foreignKey({
      name: 'hospitality_meter_readings_tariff_fk',
      columns: [t.tenantId, t.meterId, t.tariffId],
      foreignColumns: [
        hospitalityMeterTariffs.tenantId,
        hospitalityMeterTariffs.meterId,
        hospitalityMeterTariffs.id,
      ],
    }),
    valueCheck: check('hospitality_meter_readings_value_check', sql`${t.readingValue} >= 0`),
    typeCheck: check(
      'hospitality_meter_readings_type_check',
      sql`${t.readingType} IN ('normal','corrected','reset','opening')`,
    ),
    correctionCheck: check(
      'hospitality_meter_readings_correction_check',
      sql`(${t.readingType} = 'corrected') = (${t.replacesReadingId} IS NOT NULL)`,
    ),
    consumptionCheck: check(
      'hospitality_meter_readings_consumption_check',
      sql`${t.consumption} IS NULL OR ${t.consumption} >= 0`,
    ),
    costSnapshotCheck: check(
      'hospitality_meter_readings_cost_snapshot_check',
      sql`(${t.tariffId} IS NULL AND ${t.unitCostSnapshot} IS NULL AND ${t.currencySnapshot} IS NULL AND ${t.estimatedExpenditure} IS NULL) OR (${t.tariffId} IS NOT NULL AND ${t.unitCostSnapshot} IS NOT NULL AND ${t.currencySnapshot} IS NOT NULL AND ${t.estimatedExpenditure} IS NOT NULL)`,
    ),
  }),
)
