import { and, asc, desc, eq, ilike, inArray, isNull, lte, or } from 'drizzle-orm'
import {
  hospitalityMeterReadings,
  hospitalityMeters,
  hospitalityMeterTariffs,
  hospitalityProperties,
  tenantUsers,
  users,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { assertCanAccessProperty } from './property-access'

export type MeterType = 'electricity' | 'gas' | 'water' | 'custom'
export type ReadingType = 'normal' | 'corrected' | 'reset'

type Tx = Parameters<Parameters<RequestContext['db']>[0]>[0]

function memberId(ctx: RequestContext) {
  if (!ctx.membership?.id) throw new Error('An active tenant membership is required.')
  return ctx.membership.id
}
function clean(value: string | undefined, label: string, max = 200) {
  const result = value?.trim() ?? ''
  if (!result) throw new Error(`${label} is required.`)
  if (result.length > max) throw new Error(`${label} is too long.`)
  return result
}
function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`)
  return value
}
export function calculateConsumption(
  previous: number | null,
  current: number,
  kind: ReadingType | 'opening',
) {
  finiteNonNegative(current, 'Reading')
  if (kind === 'reset' || kind === 'opening' || previous == null) return null
  if (current < previous)
    throw new Error(
      'Reading is lower than the previous reading. Record a reset or replacement instead.',
    )
  return current - previous
}
export function estimatedExpenditure(consumption: number | null, unitCost: number | null) {
  if (consumption == null || unitCost == null) return null
  return Number((consumption * unitCost).toFixed(6))
}
async function visibleMeter(ctx: RequestContext, meterId: string) {
  assertCan(ctx, 'hospitality.read')
  const [meter] = await ctx.db((tx) =>
    tx
      .select()
      .from(hospitalityMeters)
      .where(and(eq(hospitalityMeters.tenantId, ctx.tenantId), eq(hospitalityMeters.id, meterId)))
      .limit(1),
  )
  if (!meter) throw new Error('Meter is unavailable.')
  assertCanAccessProperty(ctx, meter.propertyId)
  return meter
}
async function latestEffectiveTariff(tx: Tx, tenantId: string, meterId: string, at: Date) {
  const [tariff] = await tx
    .select()
    .from(hospitalityMeterTariffs)
    .where(
      and(
        eq(hospitalityMeterTariffs.tenantId, tenantId),
        eq(hospitalityMeterTariffs.meterId, meterId),
        lte(hospitalityMeterTariffs.effectiveFrom, at),
      ),
    )
    .orderBy(desc(hospitalityMeterTariffs.effectiveFrom))
    .limit(1)
  return tariff ?? null
}
async function latestReadingBefore(
  tx: Tx,
  tenantId: string,
  meterId: string,
  at: Date,
  excludedId?: string,
) {
  const conditions = [
    eq(hospitalityMeterReadings.tenantId, tenantId),
    eq(hospitalityMeterReadings.meterId, meterId),
    lte(hospitalityMeterReadings.readAt, at),
  ]
  const rows = await tx
    .select()
    .from(hospitalityMeterReadings)
    .where(and(...conditions))
    .orderBy(desc(hospitalityMeterReadings.readAt), desc(hospitalityMeterReadings.createdAt))
  return rows.find((row) => row.id !== excludedId && row.readingType !== 'corrected') ?? null
}

export async function createMeter(
  ctx: RequestContext,
  input: {
    propertyId: string
    name: string
    meterType: MeterType
    location: string
    serialNumber: string
    mpan?: string
    measurementUnit: string
    notes?: string
    installedAt: string
    openingReading: number
    previousMeterId?: string
    replacementDate?: string
  },
) {
  assertCan(ctx, 'hospitality.manage')
  assertCanAccessProperty(ctx, input.propertyId)
  const [property] = await ctx.db((tx) =>
    tx
      .select({ id: hospitalityProperties.id })
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          eq(hospitalityProperties.id, input.propertyId),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1),
  )
  if (!property) throw new Error('Property is unavailable.')
  const mpan = input.mpan?.trim() || null
  if (input.meterType === 'electricity' && !mpan)
    throw new Error('MPAN is required for an electricity meter.')
  if (input.meterType !== 'electricity' && mpan)
    throw new Error('MPAN applies only to electricity meters.')
  const installed = new Date(`${input.installedAt}T00:00:00.000Z`)
  if (!Number.isFinite(installed.getTime())) throw new Error('Installation date is invalid.')
  finiteNonNegative(input.openingReading, 'Opening reading')
  return ctx.db(async (tx) => {
    if (input.previousMeterId) {
      const [previous] = await tx
        .select({ id: hospitalityMeters.id })
        .from(hospitalityMeters)
        .where(
          and(
            eq(hospitalityMeters.tenantId, ctx.tenantId),
            eq(hospitalityMeters.id, input.previousMeterId),
            eq(hospitalityMeters.propertyId, input.propertyId),
          ),
        )
        .limit(1)
      if (!previous || !input.replacementDate)
        throw new Error('Replacement meter details are invalid.')
    }
    const [meter] = await tx
      .insert(hospitalityMeters)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        name: clean(input.name, 'Meter name'),
        meterType: input.meterType,
        location: clean(input.location, 'Location'),
        serialNumber: clean(input.serialNumber, 'Serial Number'),
        mpan,
        measurementUnit: clean(input.measurementUnit, 'Measurement unit', 50),
        notes: input.notes?.trim() || null,
        installedAt: input.installedAt,
        openingReading: input.openingReading,
        previousMeterId: input.previousMeterId ?? null,
        replacementDate: input.replacementDate ?? null,
        createdById: memberId(ctx),
      })
      .returning()
    if (!meter) throw new Error('Meter could not be created.')
    await tx.insert(hospitalityMeterReadings).values({
      tenantId: ctx.tenantId,
      meterId: meter.id,
      readingValue: input.openingReading,
      readAt: installed,
      readingType: 'opening',
      submittedById: memberId(ctx),
    })
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_meter',
      entityId: meter.id,
      action: 'create',
      summary: `Created ${input.meterType} meter ${input.serialNumber}`,
      after: { propertyId: input.propertyId, serialNumber: input.serialNumber, mpan },
    })
    return meter
  })
}

export async function addTariff(
  ctx: RequestContext,
  input: {
    meterId: string
    unitCost: number
    currency: string
    effectiveFrom: Date
  },
) {
  assertCan(ctx, 'hospitality.manage')
  const meter = await visibleMeter(ctx, input.meterId)
  finiteNonNegative(input.unitCost, 'Unit cost')
  const currency = clean(input.currency, 'Currency', 3).toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter code.')
  if (!Number.isFinite(input.effectiveFrom.getTime())) throw new Error('Effective date is invalid.')
  return ctx.db(async (tx) => {
    const [tariff] = await tx
      .insert(hospitalityMeterTariffs)
      .values({
        tenantId: ctx.tenantId,
        meterId: meter.id,
        unitCost: input.unitCost,
        currency,
        effectiveFrom: input.effectiveFrom,
        createdById: memberId(ctx),
      })
      .returning()
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_meter_tariff',
      entityId: tariff?.id,
      action: 'create',
      summary: `Added ${currency} tariff`,
      after: { meterId: meter.id, propertyId: meter.propertyId, unitCost: input.unitCost },
    })
    return tariff
  })
}

export async function addReading(
  ctx: RequestContext,
  input: {
    meterId: string
    readingValue: number
    readAt: Date
    notes?: string
    readingType?: ReadingType
    replacesReadingId?: string
  },
) {
  const meter = await visibleMeter(ctx, input.meterId)
  finiteNonNegative(input.readingValue, 'Reading')
  if (!Number.isFinite(input.readAt.getTime())) throw new Error('Reading date is invalid.')
  const kind = input.readingType ?? 'normal'
  if ((kind === 'corrected') !== Boolean(input.replacesReadingId))
    throw new Error('Corrected readings must identify the reading they replace.')
  return ctx.db(async (tx) => {
    let replaced = null
    if (input.replacesReadingId) {
      ;[replaced] = await tx
        .select()
        .from(hospitalityMeterReadings)
        .where(
          and(
            eq(hospitalityMeterReadings.tenantId, ctx.tenantId),
            eq(hospitalityMeterReadings.meterId, meter.id),
            eq(hospitalityMeterReadings.id, input.replacesReadingId),
          ),
        )
        .limit(1)
      if (!replaced) throw new Error('The reading being corrected is unavailable.')
      if (replaced.readAt.getTime() !== input.readAt.getTime())
        throw new Error('A correction must retain the original reading date.')
    }
    const previous = await latestReadingBefore(
      tx,
      ctx.tenantId,
      meter.id,
      input.readAt,
      input.replacesReadingId,
    )
    if (kind === 'normal' && previous && previous.readAt.getTime() === input.readAt.getTime())
      throw new Error('A reading already exists at this date and time.')
    const consumption = calculateConsumption(
      previous ? Number(previous.readingValue) : Number(meter.openingReading),
      input.readingValue,
      kind,
    )
    const tariff = await latestEffectiveTariff(tx, ctx.tenantId, meter.id, input.readAt)
    const cost = tariff ? estimatedExpenditure(consumption, Number(tariff.unitCost)) : null
    const [reading] = await tx
      .insert(hospitalityMeterReadings)
      .values({
        tenantId: ctx.tenantId,
        meterId: meter.id,
        readingValue: input.readingValue,
        readAt: input.readAt,
        readingType: kind,
        replacesReadingId: input.replacesReadingId ?? null,
        notes: input.notes?.trim() || null,
        submittedById: memberId(ctx),
        consumption,
        tariffId: tariff?.id ?? null,
        unitCostSnapshot: tariff ? Number(tariff.unitCost) : null,
        currencySnapshot: tariff?.currency ?? null,
        estimatedExpenditure: cost,
      })
      .returning()
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_meter_reading',
      entityId: reading?.id,
      action: 'create',
      summary: `Recorded ${kind} meter reading`,
      after: {
        meterId: meter.id,
        propertyId: meter.propertyId,
        value: input.readingValue,
        consumption,
      },
    })
    return reading
  })
}

export async function updateMeter(
  ctx: RequestContext,
  input: {
    meterId: string
    name: string
    location: string
    serialNumber: string
    mpan?: string
    measurementUnit: string
    notes?: string
  },
) {
  assertCan(ctx, 'hospitality.manage')
  const meter = await visibleMeter(ctx, input.meterId)
  const mpan = input.mpan?.trim() || null
  if (meter.meterType === 'electricity' && !mpan)
    throw new Error('MPAN is required for an electricity meter.')
  if (meter.meterType !== 'electricity' && mpan)
    throw new Error('MPAN applies only to electricity meters.')
  return ctx.db(async (tx) => {
    const [updated] = await tx
      .update(hospitalityMeters)
      .set({
        name: clean(input.name, 'Meter name'),
        location: clean(input.location, 'Location'),
        serialNumber: clean(input.serialNumber, 'Serial Number'),
        mpan,
        measurementUnit: clean(input.measurementUnit, 'Measurement unit', 50),
        notes: input.notes?.trim() || null,
      })
      .where(
        and(
          eq(hospitalityMeters.tenantId, ctx.tenantId),
          eq(hospitalityMeters.id, meter.id),
          eq(hospitalityMeters.propertyId, meter.propertyId),
        ),
      )
      .returning()
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_meter',
      entityId: meter.id,
      action: 'update',
      summary: 'Updated meter configuration',
      before: { name: meter.name, serialNumber: meter.serialNumber, mpan: meter.mpan },
      after: {
        propertyId: meter.propertyId,
        name: updated?.name,
        serialNumber: updated?.serialNumber,
        mpan: updated?.mpan,
      },
    })
    return updated
  })
}

export async function setMeterActive(ctx: RequestContext, meterId: string, active: boolean) {
  assertCan(ctx, 'hospitality.manage')
  const meter = await visibleMeter(ctx, meterId)
  return ctx.db(async (tx) => {
    await tx
      .update(hospitalityMeters)
      .set({ active })
      .where(and(eq(hospitalityMeters.tenantId, ctx.tenantId), eq(hospitalityMeters.id, meter.id)))
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_meter',
      entityId: meter.id,
      action: 'update',
      summary: active ? 'Activated meter' : 'Deactivated meter',
      after: { propertyId: meter.propertyId, active },
    })
  })
}

export async function listMetering(
  ctx: RequestContext,
  input: { propertyIds: string[]; q?: string },
) {
  assertCan(ctx, 'hospitality.read')
  input.propertyIds.forEach((id) => assertCanAccessProperty(ctx, id))
  if (!input.propertyIds.length) return { meters: [], readings: [], tariffs: [] }
  const search = input.q?.trim()
  return ctx.db(async (tx) => {
    const meters = await tx
      .select({
        id: hospitalityMeters.id,
        propertyId: hospitalityMeters.propertyId,
        propertyName: hospitalityProperties.name,
        name: hospitalityMeters.name,
        meterType: hospitalityMeters.meterType,
        location: hospitalityMeters.location,
        serialNumber: hospitalityMeters.serialNumber,
        mpan: hospitalityMeters.mpan,
        measurementUnit: hospitalityMeters.measurementUnit,
        active: hospitalityMeters.active,
        installedAt: hospitalityMeters.installedAt,
        openingReading: hospitalityMeters.openingReading,
      })
      .from(hospitalityMeters)
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, hospitalityMeters.tenantId),
          eq(hospitalityProperties.id, hospitalityMeters.propertyId),
        ),
      )
      .where(
        and(
          eq(hospitalityMeters.tenantId, ctx.tenantId),
          inArray(hospitalityMeters.propertyId, input.propertyIds),
          search
            ? or(
                ilike(hospitalityMeters.name, `%${search}%`),
                ilike(hospitalityMeters.serialNumber, `%${search}%`),
                ilike(hospitalityMeters.mpan, `%${search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(asc(hospitalityProperties.name), asc(hospitalityMeters.name))
    const ids = meters.map((meter) => meter.id)
    if (!ids.length) return { meters, readings: [], tariffs: [] }
    const readings = await tx
      .select({
        id: hospitalityMeterReadings.id,
        meterId: hospitalityMeterReadings.meterId,
        readingValue: hospitalityMeterReadings.readingValue,
        readAt: hospitalityMeterReadings.readAt,
        readingType: hospitalityMeterReadings.readingType,
        notes: hospitalityMeterReadings.notes,
        consumption: hospitalityMeterReadings.consumption,
        unitCost: hospitalityMeterReadings.unitCostSnapshot,
        currency: hospitalityMeterReadings.currencySnapshot,
        expenditure: hospitalityMeterReadings.estimatedExpenditure,
        submitterName: users.name,
      })
      .from(hospitalityMeterReadings)
      .innerJoin(
        tenantUsers,
        and(
          eq(tenantUsers.tenantId, hospitalityMeterReadings.tenantId),
          eq(tenantUsers.id, hospitalityMeterReadings.submittedById),
        ),
      )
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(
        and(
          eq(hospitalityMeterReadings.tenantId, ctx.tenantId),
          inArray(hospitalityMeterReadings.meterId, ids),
        ),
      )
      .orderBy(desc(hospitalityMeterReadings.readAt))
    const tariffs = await tx
      .select()
      .from(hospitalityMeterTariffs)
      .where(
        and(
          eq(hospitalityMeterTariffs.tenantId, ctx.tenantId),
          inArray(hospitalityMeterTariffs.meterId, ids),
        ),
      )
      .orderBy(desc(hospitalityMeterTariffs.effectiveFrom))
    return { meters, readings, tariffs }
  })
}
