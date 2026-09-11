import { and, eq, isNull } from 'drizzle-orm'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { hospitalityBuildings, hospitalityFloors, hospitalityProperties, hospitalityRooms } from '@beaconhs/db/schema'
import { recordAudit } from '@/lib/audit'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'

type CreateProperty = { name: string; code: string; timezone: string }
function clean(value: string, label: string) { const v = value.trim(); if (!v) throw new Error(`${label} is required`); return v }
async function gate(ctx: RequestContext, write = false) { await assertTenantModuleEntitled(ctx, 'hospitality.properties'); assertCan(ctx, write ? 'hospitality.manage' : 'hospitality.read') }
async function requireParent<T extends { id: unknown }>(ctx: RequestContext, table: any, id: string, label: string) { const [row] = await ctx.db((tx) => tx.select({ id: table.id }).from(table).where(and(eq(table.tenantId, ctx.tenantId), eq(table.id, id), isNull(table.deletedAt))).limit(1)); if (!row) throw new Error(`No ${label} exists in this tenant`); return row }

export async function listProperties(ctx: RequestContext) {
  await gate(ctx)
  return ctx.db((tx) => tx.select().from(hospitalityProperties).where(and(eq(hospitalityProperties.tenantId, ctx.tenantId), isNull(hospitalityProperties.deletedAt))))
}
export async function createProperty(ctx: RequestContext, input: CreateProperty) {
  await gate(ctx, true); const name = clean(input.name, 'Property name'); const code = clean(input.code, 'Property code'); const timezone = clean(input.timezone, 'Property timezone')
  const [row] = await ctx.db((tx) => tx.insert(hospitalityProperties).values({ tenantId: ctx.tenantId, name, code, timezone }).returning())
  if (!row) throw new Error('Property creation failed')
  await recordAudit(ctx, { entityType: 'hospitality_property', entityId: row.id, action: 'create', summary: `Created property ${row.name}` })
  return row
}
export async function createBuilding(ctx: RequestContext, propertyId: string, name: string, code: string) { await gate(ctx, true); await requireParent(ctx,hospitalityProperties,propertyId,'property'); return ctx.db((tx) => tx.insert(hospitalityBuildings).values({ tenantId: ctx.tenantId, propertyId, name: clean(name,'Building name'), code: clean(code,'Building code') }).returning()) }
export async function createFloor(ctx: RequestContext, buildingId: string, name: string, code: string) { await gate(ctx, true); await requireParent(ctx,hospitalityBuildings,buildingId,'building'); return ctx.db((tx) => tx.insert(hospitalityFloors).values({ tenantId: ctx.tenantId, buildingId, name: clean(name,'Floor name'), code: clean(code,'Floor code') }).returning()) }
export async function createRoom(ctx: RequestContext, floorId: string, code: string, name?: string, roomType?: string) { await gate(ctx, true); await requireParent(ctx,hospitalityFloors,floorId,'floor'); return ctx.db((tx) => tx.insert(hospitalityRooms).values({ tenantId: ctx.tenantId, floorId, code: clean(code,'Room code'), name: name?.trim() || null, roomType: roomType?.trim() || null }).returning()) }
export async function archiveProperty(ctx: RequestContext, id: string) { await gate(ctx,true); const [row] = await ctx.db(tx => tx.update(hospitalityProperties).set({ deletedAt: new Date() }).where(and(eq(hospitalityProperties.tenantId,ctx.tenantId),eq(hospitalityProperties.id,id),isNull(hospitalityProperties.deletedAt))).returning()); if (!row) throw new Error('No property exists in this tenant'); await recordAudit(ctx,{entityType:'hospitality_property',entityId:id,action:'archive',summary:`Archived property ${row.name}`}); return row }
