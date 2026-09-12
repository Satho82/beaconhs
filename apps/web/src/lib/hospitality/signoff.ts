import { and, eq, gte, lt } from 'drizzle-orm'
import { hospitalityProperties, managerSignoffs, operationalTaskOccurrences, operationalTaskSchedules } from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { recordAudit } from '@/lib/audit'

export type SignoffKind = 'weekly' | 'monthly'
export function signoffPeriod(kind: SignoffKind, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (kind === 'weekly') { start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7); return { start, end } }
  start.setUTCDate(1); const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); return { start, end }
}
async function gate(ctx: RequestContext, write = false) { await assertTenantModuleEntitled(ctx, 'hospitality.diary'); assertCan(ctx, write ? 'hospitality.manage' : 'hospitality.read') }
export async function signoffSummary(ctx: RequestContext, propertyId: string, kind: SignoffKind, now = new Date()) {
  await gate(ctx); const { start, end } = signoffPeriod(kind, now)
  const rows = await ctx.db(tx => tx.select({ status: operationalTaskOccurrences.status }).from(operationalTaskOccurrences).innerJoin(operationalTaskSchedules, and(eq(operationalTaskSchedules.tenantId, operationalTaskOccurrences.tenantId), eq(operationalTaskSchedules.id, operationalTaskOccurrences.scheduleId))).where(and(eq(operationalTaskOccurrences.tenantId, ctx.tenantId), eq(operationalTaskSchedules.propertyId, propertyId), gte(operationalTaskOccurrences.dueAt, start), lt(operationalTaskOccurrences.dueAt, end))))
  return { start, end, total: rows.length, completed: rows.filter(r=>r.status==='completed').length, overdue: rows.filter(r=>r.status==='overdue'||r.status==='escalated').length, escalated: rows.filter(r=>r.status==='escalated').length, incomplete: rows.filter(r=>r.status!=='completed').length }
}
export async function confirmSignoff(ctx: RequestContext, propertyId: string, kind: SignoffKind, comments: string, now = new Date()) {
  await gate(ctx, true); const summary = await signoffSummary(ctx, propertyId, kind, now); const [property] = await ctx.db(tx=>tx.select({id:hospitalityProperties.id}).from(hospitalityProperties).where(and(eq(hospitalityProperties.tenantId,ctx.tenantId),eq(hospitalityProperties.id,propertyId))).limit(1)); if(!property) throw new Error('Property does not belong to this tenant.')
  const [row] = await ctx.db(tx=>tx.insert(managerSignoffs).values({tenantId:ctx.tenantId,propertyId,kind,periodStart:summary.start,periodEnd:summary.end,summary,comments:comments.trim()||null,confirmedAt:now,confirmedByTenantUserId:ctx.membership?.id??'super-admin'}).onConflictDoNothing().returning())
  if(!row) throw new Error('This period has already been signed off.')
  await recordAudit(ctx,{entityType:'manager_signoff',entityId:row.id,action:'sign',summary:`Confirmed ${kind} manager sign-off`,metadata:{propertyId,periodStart:summary.start.toISOString(),periodEnd:summary.end.toISOString()}}); return row
}
export async function listPropertySignoffs(ctx: RequestContext, propertyId: string) {
  await gate(ctx)
  return ctx.db(tx=>tx.select().from(managerSignoffs).where(and(eq(managerSignoffs.tenantId,ctx.tenantId),eq(managerSignoffs.propertyId,propertyId))).orderBy(managerSignoffs.confirmedAt))
}
