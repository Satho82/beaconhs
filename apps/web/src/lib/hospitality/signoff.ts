import { signoffPeriod, type SignoffKind } from './signoff-period'
import { and, count, desc, eq, gte, isNull, lt } from 'drizzle-orm'
import {
  hospitalityProperties,
  managerSignoffs,
  operationalTaskOccurrences,
  operationalTaskSchedules,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { recordAudit } from '@/lib/audit'

async function gate(ctx: RequestContext, write = false) {
  await assertTenantModuleEntitled(ctx, 'hospitality.diary')
  await assertTenantModuleEntitled(ctx, 'hospitality.manager-signoff')
  assertCan(ctx, write ? 'hospitality.manage' : 'hospitality.read')
}
export async function signoffSummary(
  ctx: RequestContext,
  propertyId: string,
  kind: SignoffKind,
  now = new Date(),
) {
  await gate(ctx)
  const { start, end } = signoffPeriod(kind, now)
  const rows = await ctx.db((tx) =>
    tx
      .select({ status: operationalTaskOccurrences.status })
      .from(operationalTaskOccurrences)
      .innerJoin(
        operationalTaskSchedules,
        and(
          eq(operationalTaskSchedules.tenantId, operationalTaskOccurrences.tenantId),
          eq(operationalTaskSchedules.id, operationalTaskOccurrences.scheduleId),
        ),
      )
      .where(
        and(
          eq(operationalTaskOccurrences.tenantId, ctx.tenantId),
          eq(operationalTaskSchedules.propertyId, propertyId),
          gte(operationalTaskOccurrences.dueAt, start),
          lt(operationalTaskOccurrences.dueAt, end),
        ),
      ),
  )
  return {
    start,
    end,
    total: rows.length,
    completed: rows.filter((r) => r.status === 'completed').length,
    overdue: rows.filter((r) => r.status === 'overdue' || r.status === 'escalated').length,
    escalated: rows.filter((r) => r.status === 'escalated').length,
    incomplete: rows.filter((r) => r.status !== 'completed').length,
  }
}
export async function confirmSignoff(
  ctx: RequestContext,
  propertyId: string,
  kind: SignoffKind,
  comments: string,
  now = new Date(),
) {
  await gate(ctx, true)
  const membershipId = ctx.membership?.id
  if (!membershipId) throw new Error('A tenant membership is required to sign off a period.')
  const cleanComments = comments.trim()
  if (cleanComments.length > 4_000) throw new Error('Manager comments are too long.')
  const summary = await signoffSummary(ctx, propertyId, kind, now)
  const [property] = await ctx.db((tx) =>
    tx
      .select({ id: hospitalityProperties.id })
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          eq(hospitalityProperties.id, propertyId),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1),
  )
  if (!property) throw new Error('Property does not belong to this tenant.')
  const [row] = await ctx.db((tx) =>
    tx
      .insert(managerSignoffs)
      .values({
        tenantId: ctx.tenantId,
        propertyId,
        kind,
        periodStart: summary.start,
        periodEnd: summary.end,
        summary,
        comments: cleanComments || null,
        confirmedAt: now,
        confirmedByTenantUserId: membershipId,
      })
      .onConflictDoNothing()
      .returning(),
  )
  if (!row) throw new Error('This period has already been signed off.')
  await recordAudit(ctx, {
    entityType: 'manager_signoff',
    entityId: row.id,
    action: 'sign',
    summary: `Confirmed ${kind} manager sign-off`,
    metadata: {
      propertyId,
      periodStart: summary.start.toISOString(),
      periodEnd: summary.end.toISOString(),
    },
  })
  return row
}
export async function listPropertySignoffs(
  ctx: RequestContext,
  propertyId: string,
  kind: SignoffKind,
  limit: number,
  offset: number,
) {
  await gate(ctx)
  const where = and(
    eq(managerSignoffs.tenantId, ctx.tenantId),
    eq(managerSignoffs.propertyId, propertyId),
    eq(managerSignoffs.kind, kind),
  )
  return ctx.db(async (tx) => {
    const rows = await tx
      .select()
      .from(managerSignoffs)
      .where(where)
      .orderBy(desc(managerSignoffs.confirmedAt), desc(managerSignoffs.id))
      .limit(limit)
      .offset(offset)
    const [total] = await tx.select({ value: count() }).from(managerSignoffs).where(where)
    return { rows, total: total?.value ?? 0 }
  })
}
