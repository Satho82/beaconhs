import { and, eq, isNull } from 'drizzle-orm'
import { hospitalityRooms, qrTargets } from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { createRoomQrToken } from './guest-maintenance'

async function gate(ctx: RequestContext) {
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, 'hospitality.manage')
}

async function assertRoom(ctx: RequestContext, roomId: string) {
  const [room] = await ctx.db((tx) =>
    tx
      .select({ id: hospitalityRooms.id })
      .from(hospitalityRooms)
      .where(
        and(
          eq(hospitalityRooms.tenantId, ctx.tenantId),
          eq(hospitalityRooms.id, roomId),
          isNull(hospitalityRooms.deletedAt),
        ),
      )
      .limit(1),
  )
  if (!room) throw new Error('No room exists in this tenant.')
}
export async function provisionRoomQr(ctx: RequestContext, roomId: string) {
  await gate(ctx)
  await assertRoom(ctx, roomId)
  return ctx.db(async (tx) => {
    const [existing] = await tx
      .select()
      .from(qrTargets)
      .where(and(eq(qrTargets.tenantId, ctx.tenantId), eq(qrTargets.roomId, roomId)))
      .limit(1)
    if (existing?.isActive) return existing
    const token = createRoomQrToken()
    const [row] = existing
      ? await tx
          .update(qrTargets)
          .set({ token, isActive: true, updatedAt: new Date() })
          .where(and(eq(qrTargets.tenantId, ctx.tenantId), eq(qrTargets.id, existing.id)))
          .returning()
      : await tx
          .insert(qrTargets)
          .values({ tenantId: ctx.tenantId, roomId, kind: 'room', token })
          .returning()
    if (!row) throw new Error('Room QR code could not be created.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_room',
      entityId: roomId,
      action: 'update',
      summary: 'Enabled guest maintenance QR reporting',
      metadata: { qrTargetId: row.id },
    })
    return row
  })
}
export async function rotateRoomQr(ctx: RequestContext, roomId: string) {
  await gate(ctx)
  await assertRoom(ctx, roomId)
  return ctx.db(async (tx) => {
    const [row] = await tx
      .update(qrTargets)
      .set({ token: createRoomQrToken(), isActive: true, updatedAt: new Date() })
      .where(and(eq(qrTargets.tenantId, ctx.tenantId), eq(qrTargets.roomId, roomId)))
      .returning()
    if (!row) throw new Error('Create the room QR code before rotating it.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_room',
      entityId: roomId,
      action: 'update',
      summary: 'Rotated guest maintenance QR code',
      metadata: { qrTargetId: row.id },
    })
    return row
  })
}

export function guestMaintenanceUrl(token: string): string {
  const base = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000'
  return new URL(`/guest/maintenance/${token}`, base).toString()
}
