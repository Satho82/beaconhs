import { propertyInputSchema } from './property-input'
import { isUuid, parseListParams } from '../list-params'
import { and, asc, desc, count, eq, ilike, isNull, or } from 'drizzle-orm'
import { assertCan, assignedPropertyIds, type RequestContext } from '@beaconhs/tenant'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
} from '@beaconhs/db/schema'
import type { Database } from '@beaconhs/db'
import { recordAudit, recordAuditInTransaction } from '@/lib/audit'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import {
  assertCanAccessProperty,
  hospitalityPropertyWhere,
} from '@/lib/hospitality/property-access'

type CreateProperty = { name: string; code: string; timezone: string }
function clean(value: string, label: string) {
  const v = value.trim()
  if (!v) throw new Error(`${label} is required`)
  return v
}
async function gate(ctx: RequestContext, write = false) {
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, write ? 'hospitality.manage' : 'hospitality.read')
}
async function requireParent(
  tx: Database,
  ctx: RequestContext,
  table: typeof hospitalityProperties | typeof hospitalityBuildings | typeof hospitalityFloors,
  id: string,
  label: string,
): Promise<void> {
  if (!isUuid(id)) throw new Error(`Invalid ${label} identifier.`)
  const [row] = await tx
    .select({
      id: table.id,
      parentId:
        table === hospitalityFloors
          ? hospitalityFloors.buildingId
          : table === hospitalityBuildings
            ? hospitalityBuildings.propertyId
            : hospitalityProperties.id,
    })
    .from(table)
    .where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id), isNull(table.deletedAt)))
    .limit(1)
    .for('share')
  if (!row) throw new Error(`No ${label} exists in this tenant`)
  if (table === hospitalityProperties) assertCanAccessProperty(ctx, row.id)
  // Keep ancestors active until the mutation commits, even during concurrent
  // archival. Follow stored parent links rather than submitted form values.
  if (table === hospitalityFloors) {
    await requireParent(tx, ctx, hospitalityBuildings, row.parentId, 'building')
  } else if (table === hospitalityBuildings) {
    await requireParent(tx, ctx, hospitalityProperties, row.parentId, 'property')
  }
}

export async function listProperties(
  ctx: RequestContext,
  searchParams: Record<string, string | string[] | undefined> = {},
  activePropertyId: string | null = null,
) {
  await gate(ctx)
  const params = parseListParams(searchParams, {
    sort: 'name',
    dir: 'asc',
    allowedSorts: ['name', 'code'] as const,
  })
  const where = and(
    eq(hospitalityProperties.tenantId, ctx.tenantId),
    hospitalityPropertyWhere(ctx, hospitalityProperties.id),
    activePropertyId ? eq(hospitalityProperties.id, activePropertyId) : undefined,
    isNull(hospitalityProperties.deletedAt),
    params.q
      ? or(
          ilike(hospitalityProperties.name, `%${params.q}%`),
          ilike(hospitalityProperties.code, `%${params.q}%`),
        )
      : undefined,
  )
  return ctx.db(async (tx) => {
    const [total] = await tx.select({ value: count() }).from(hospitalityProperties).where(where)
    const properties = await tx
      .select()
      .from(hospitalityProperties)
      .where(where)
      .orderBy(
        (params.dir === 'asc' ? asc : desc)(hospitalityProperties[params.sort]),
        asc(hospitalityProperties.id),
      )
      .limit(params.perPage)
      .offset((params.page - 1) * params.perPage)
    return { properties, total: total?.value ?? 0, params }
  })
}
export async function createProperty(ctx: RequestContext, input: CreateProperty) {
  await gate(ctx, true)
  if (assignedPropertyIds(ctx) !== null)
    throw new Error('Only management-company administrators can create properties.')
  const { name, code, timezone } = propertyInputSchema.parse(input)
  return ctx.db(async (tx) => {
    const [row] = await tx
      .insert(hospitalityProperties)
      .values({ tenantId: ctx.tenantId, name, code, timezone })
      .returning()
    if (!row) throw new Error('Property creation failed')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_property',
      entityId: row.id,
      action: 'create',
      summary: `Created property ${row.name}`,
    })
    return row
  })
}
export async function createBuilding(
  ctx: RequestContext,
  propertyId: string,
  name: string,
  code: string,
) {
  await gate(ctx, true)
  if (!isUuid(propertyId)) throw new Error('Invalid property identifier.')
  return ctx.db(async (tx) => {
    await requireParent(tx, ctx, hospitalityProperties, propertyId, 'property')
    const rows = await tx
      .insert(hospitalityBuildings)
      .values({
        tenantId: ctx.tenantId,
        propertyId,
        name: clean(name, 'Building name'),
        code: clean(code, 'Building code'),
      })
      .returning()
    const [row] = rows
    if (!row) throw new Error('Building creation failed')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_building',
      entityId: row.id,
      action: 'create',
      summary: `Created building ${row.name}`,
    })
    return rows
  })
}
export async function updateBuilding(
  ctx: RequestContext,
  propertyId: string,
  buildingId: string,
  name: string,
  code: string,
) {
  await gate(ctx, true)
  if (!isUuid(propertyId)) throw new Error('Invalid property identifier.')
  if (!isUuid(buildingId)) throw new Error('Invalid building identifier.')
  return ctx.db(async (tx) => {
    await requireParent(tx, ctx, hospitalityProperties, propertyId, 'property')
    const [row] = await tx
      .update(hospitalityBuildings)
      .set({ name: clean(name, 'Building name'), code: clean(code, 'Building code') })
      .where(
        and(
          eq(hospitalityBuildings.tenantId, ctx.tenantId),
          eq(hospitalityBuildings.id, buildingId),
          eq(hospitalityBuildings.propertyId, propertyId),
          isNull(hospitalityBuildings.deletedAt),
        ),
      )
      .returning()
    if (!row) throw new Error('No building exists for this property')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_building',
      entityId: row.id,
      action: 'update',
      summary: `Updated building ${row.name}`,
    })
    return row
  })
}
export async function createFloor(
  ctx: RequestContext,
  buildingId: string,
  name: string,
  code: string,
) {
  await gate(ctx, true)
  if (!isUuid(buildingId)) throw new Error('Invalid building identifier.')
  return ctx.db(async (tx) => {
    await requireParent(tx, ctx, hospitalityBuildings, buildingId, 'building')
    const rows = await tx
      .insert(hospitalityFloors)
      .values({
        tenantId: ctx.tenantId,
        buildingId,
        name: clean(name, 'Floor name'),
        code: clean(code, 'Floor code'),
      })
      .returning()
    const [row] = rows
    if (!row) throw new Error('Floor creation failed')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_floor',
      entityId: row.id,
      action: 'create',
      summary: `Created floor ${row.name}`,
    })
    return rows
  })
}
export async function updateFloor(
  ctx: RequestContext,
  buildingId: string,
  floorId: string,
  name: string,
  code: string,
) {
  await gate(ctx, true)
  if (!isUuid(buildingId)) throw new Error('Invalid building identifier.')
  if (!isUuid(floorId)) throw new Error('Invalid floor identifier.')
  return ctx.db(async (tx) => {
    await requireParent(tx, ctx, hospitalityBuildings, buildingId, 'building')
    const [row] = await tx
      .update(hospitalityFloors)
      .set({ name: clean(name, 'Floor name'), code: clean(code, 'Floor code') })
      .where(
        and(
          eq(hospitalityFloors.tenantId, ctx.tenantId),
          eq(hospitalityFloors.id, floorId),
          eq(hospitalityFloors.buildingId, buildingId),
          isNull(hospitalityFloors.deletedAt),
        ),
      )
      .returning()
    if (!row) throw new Error('No floor exists for this building')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_floor',
      entityId: row.id,
      action: 'update',
      summary: `Updated floor ${row.name}`,
    })
    return row
  })
}
export async function createRoom(
  ctx: RequestContext,
  floorId: string,
  code: string,
  name?: string,
  roomType?: string,
) {
  await gate(ctx, true)
  if (!isUuid(floorId)) throw new Error('Invalid floor identifier.')
  return ctx.db(async (tx) => {
    await requireParent(tx, ctx, hospitalityFloors, floorId, 'floor')
    const rows = await tx
      .insert(hospitalityRooms)
      .values({
        tenantId: ctx.tenantId,
        floorId,
        code: clean(code, 'Room code'),
        name: name?.trim() || null,
        roomType: roomType?.trim() || null,
      })
      .returning()
    const [row] = rows
    if (!row) throw new Error('Room creation failed')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_room',
      entityId: row.id,
      action: 'create',
      summary: `Created room ${row.code}`,
    })
    return rows
  })
}
export async function updateRoom(
  ctx: RequestContext,
  floorId: string,
  roomId: string,
  code: string,
  name?: string,
  roomType?: string,
) {
  await gate(ctx, true)
  if (!isUuid(floorId)) throw new Error('Invalid floor identifier.')
  if (!isUuid(roomId)) throw new Error('Invalid room identifier.')
  return ctx.db(async (tx) => {
    await requireParent(tx, ctx, hospitalityFloors, floorId, 'floor')
    const [row] = await tx
      .update(hospitalityRooms)
      .set({
        code: clean(code, 'Room code'),
        name: name?.trim() || null,
        roomType: roomType?.trim() || null,
      })
      .where(
        and(
          eq(hospitalityRooms.tenantId, ctx.tenantId),
          eq(hospitalityRooms.id, roomId),
          eq(hospitalityRooms.floorId, floorId),
          isNull(hospitalityRooms.deletedAt),
        ),
      )
      .returning()
    if (!row) throw new Error('No room exists for this floor')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_room',
      entityId: row.id,
      action: 'update',
      summary: `Updated room ${row.code}`,
    })
    return row
  })
}
export async function archiveProperty(ctx: RequestContext, id: string) {
  await gate(ctx, true)
  if (!isUuid(id)) throw new Error('Invalid property identifier.')
  assertCanAccessProperty(ctx, id)
  const [row] = await ctx.db((tx) =>
    tx
      .update(hospitalityProperties)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          eq(hospitalityProperties.id, id),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .returning(),
  )
  if (!row) throw new Error('No property exists in this tenant')
  await recordAudit(ctx, {
    entityType: 'hospitality_property',
    entityId: id,
    action: 'archive',
    summary: `Archived property ${row.name}`,
  })
  return row
}
