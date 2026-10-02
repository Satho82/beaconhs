import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'
import {
  bulkImportBatches,
  bulkImportRows,
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import {
  assertCanAccessProperty,
  hospitalityPropertyWhere,
} from '@/lib/hospitality/property-access'

type Row = {
  property_code: string
  property_name: string
  property_timezone: string
  building_code?: string
  building_name?: string
  floor_code?: string
  floor_name?: string
  room_code?: string
  room_name?: string
  room_type?: string
}

export async function executePropertyStructureBatch(ctx: RequestContext, batchId: string) {
  assertCan(ctx, 'hospitality.manage')
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  return ctx.db(async (tx) => {
    const [batch] = await tx
      .select()
      .from(bulkImportBatches)
      .where(and(eq(bulkImportBatches.id, batchId), eq(bulkImportBatches.tenantId, ctx.tenantId)))
      .limit(1)
      .for('update')
    if (!batch || batch.datasetKey !== 'property.structure')
      throw new Error('Import batch not found.')
    if (batch.status !== 'ready_for_confirmation' || !batch.confirmedAt)
      throw new Error('Import batch is not eligible for execution.')
    await tx
      .update(bulkImportBatches)
      .set({ status: 'processing', processingAt: new Date() })
      .where(eq(bulkImportBatches.id, batch.id))
    const rows = await tx
      .select()
      .from(bulkImportRows)
      .where(and(eq(bulkImportRows.tenantId, ctx.tenantId), eq(bulkImportRows.batchId, batch.id)))
      .orderBy(bulkImportRows.sourceRowNumber)
    if (rows.some((row) => row.status === 'rejected'))
      throw new Error('Import batch contains rejected rows.')
    const properties = new Map<string, string>()
    const buildings = new Map<string, string>()
    const floors = new Map<string, string>()
    let created = 0
    for (const persisted of rows) {
      const row = persisted.mappedValues as Row
      const propertyKey = row.property_code.trim().toLowerCase()
      let propertyId = properties.get(propertyKey)
      if (!propertyId) {
        const [existing] = await tx
          .select()
          .from(hospitalityProperties)
          .where(
            and(
              eq(hospitalityProperties.tenantId, ctx.tenantId),
              eq(hospitalityProperties.code, row.property_code),
              isNull(hospitalityProperties.deletedAt),
            ),
          )
          .limit(1)
        if (existing) throw new Error(`Property code already exists: ${row.property_code}.`)
        const [property] = await tx
          .insert(hospitalityProperties)
          .values({
            tenantId: ctx.tenantId,
            name: row.property_name,
            code: row.property_code,
            timezone: row.property_timezone,
          })
          .returning()
        if (!property) throw new Error('Property creation failed.')
        assertCanAccessProperty(ctx, property.id)
        propertyId = property.id
        properties.set(propertyKey, propertyId)
        created++
      }
      if (!row.building_code) continue
      const buildingKey = `${propertyKey}/${row.building_code.toLowerCase()}`
      let buildingId = buildings.get(buildingKey)
      if (!buildingId) {
        const [building] = await tx
          .insert(hospitalityBuildings)
          .values({
            tenantId: ctx.tenantId,
            propertyId,
            name: row.building_name || row.building_code,
            code: row.building_code,
          })
          .returning()
        if (!building) throw new Error('Building creation failed.')
        buildingId = building.id
        buildings.set(buildingKey, buildingId)
        created++
      }
      if (!row.floor_code) continue
      const floorKey = `${buildingKey}/${row.floor_code.toLowerCase()}`
      let floorId = floors.get(floorKey)
      if (!floorId) {
        const [floor] = await tx
          .insert(hospitalityFloors)
          .values({
            tenantId: ctx.tenantId,
            buildingId,
            name: row.floor_name || row.floor_code,
            code: row.floor_code,
          })
          .returning()
        if (!floor) throw new Error('Floor creation failed.')
        floorId = floor.id
        floors.set(floorKey, floorId)
        created++
      }
      if (!row.room_code) continue
      const [room] = await tx
        .insert(hospitalityRooms)
        .values({
          tenantId: ctx.tenantId,
          floorId,
          code: row.room_code,
          name: row.room_name || null,
          roomType: row.room_type || null,
        })
        .returning()
      if (!room) throw new Error('Room creation failed.')
      created++
    }
    const result = { created, duplicate: 0, skipped: 0, rejected: 0, failed: 0 }
    await tx
      .update(bulkImportBatches)
      .set({ status: 'completed', completedAt: new Date(), result })
      .where(eq(bulkImportBatches.id, batch.id))
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'bulk_import_batch',
      entityId: batch.id,
      action: 'create',
      summary: 'Completed Property Structure import',
      after: result,
    })
    return result
  })
}

export async function exportPropertyStructure(ctx: RequestContext) {
  assertCan(ctx, 'hospitality.read')
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  return ctx.db((tx) =>
    tx
      .select({
        propertyCode: hospitalityProperties.code,
        propertyName: hospitalityProperties.name,
        timezone: hospitalityProperties.timezone,
        buildingCode: hospitalityBuildings.code,
        floorCode: hospitalityFloors.code,
        roomCode: hospitalityRooms.code,
        roomName: hospitalityRooms.name,
        roomType: hospitalityRooms.roomType,
      })
      .from(hospitalityProperties)
      .leftJoin(hospitalityBuildings, eq(hospitalityBuildings.propertyId, hospitalityProperties.id))
      .leftJoin(hospitalityFloors, eq(hospitalityFloors.buildingId, hospitalityBuildings.id))
      .leftJoin(hospitalityRooms, eq(hospitalityRooms.floorId, hospitalityFloors.id))
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          isNull(hospitalityProperties.deletedAt),
          hospitalityPropertyWhere(ctx, hospitalityProperties.id),
        ),
      ),
  )
}
