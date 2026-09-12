import { and, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { hospitalityProperties, operationalTaskLifecycleEvents, operationalTaskOccurrences, operationalTaskSchedules, operationalTaskTemplates, roleAssignments, roles, tenantModuleEntitlements, tenantUsers } from '@beaconhs/db/schema'
import { enqueueNotification } from '@beaconhs/jobs'

// Central, replaceable Phase 1 timings. Templates can gain overrides later
// without changing the queue or ledger contract.
export const OPERATIONAL_TASK_LIFECYCLE = { upcomingMinutes: 60, managerOverdueMinutes: 24 * 60, finalEscalationMinutes: 72 * 60 } as const

type Stage = 'upcoming_reminder' | 'due_notification' | 'overdue_notification'

export function lifecycleStageForTask(task: { status: string; dueAt: Date }, now: Date): Stage | null {
  if (['completed', 'waived', 'cancelled'].includes(task.status)) return null
  if (task.dueAt < now) return 'overdue_notification'
  if (task.dueAt.getTime() <= now.getTime() + OPERATIONAL_TASK_LIFECYCLE.upcomingMinutes * 60_000) return 'upcoming_reminder'
  return null
}

/** One ledger row per occurrence/stage/recipient is the durable idempotency boundary. */
export async function processOperationalTaskLifecycle(now = new Date()) {
  const candidates = await withSuperAdmin(db, (tx) => tx.select({ occurrence: operationalTaskOccurrences, schedule: operationalTaskSchedules, template: operationalTaskTemplates, property: hospitalityProperties, assignee: tenantUsers }).from(operationalTaskOccurrences).innerJoin(operationalTaskSchedules, and(eq(operationalTaskSchedules.tenantId, operationalTaskOccurrences.tenantId), eq(operationalTaskSchedules.id, operationalTaskOccurrences.scheduleId))).innerJoin(operationalTaskTemplates, and(eq(operationalTaskTemplates.tenantId, operationalTaskSchedules.tenantId), eq(operationalTaskTemplates.id, operationalTaskSchedules.templateId))).innerJoin(hospitalityProperties, and(eq(hospitalityProperties.tenantId, operationalTaskSchedules.tenantId), eq(hospitalityProperties.id, operationalTaskSchedules.propertyId))).innerJoin(tenantUsers, and(eq(tenantUsers.tenantId, operationalTaskOccurrences.tenantId), eq(tenantUsers.id, operationalTaskOccurrences.assignedToTenantUserId))).innerJoin(tenantModuleEntitlements, and(eq(tenantModuleEntitlements.tenantId, operationalTaskOccurrences.tenantId), eq(tenantModuleEntitlements.moduleKey, 'hospitality.diary'), eq(tenantModuleEntitlements.state, 'enabled'), or(isNull(tenantModuleEntitlements.effectiveFrom), lte(tenantModuleEntitlements.effectiveFrom, now)), or(isNull(tenantModuleEntitlements.effectiveUntil), gt(tenantModuleEntitlements.effectiveUntil, now)))).where(and(eq(operationalTaskSchedules.isActive, true), isNull(operationalTaskTemplates.deletedAt), isNull(hospitalityProperties.deletedAt), isNull(operationalTaskOccurrences.completedAt), lt(operationalTaskOccurrences.dueAt, new Date(now.getTime() + OPERATIONAL_TASK_LIFECYCLE.upcomingMinutes * 60_000))).limit(200))
  let processed = 0
  for (const row of candidates) {
    const stage = lifecycleStageForTask(row.occurrence, now)
    if (!stage || row.assignee.status !== 'active') continue
    const [claimed] = await withSuperAdmin(db, (tx) => tx.insert(operationalTaskLifecycleEvents).values({ tenantId: row.occurrence.tenantId, occurrenceId: row.occurrence.id, stage, recipientUserId: row.assignee.userId, metadata: { propertyId: row.property.id } }).onConflictDoNothing().returning({ id: operationalTaskLifecycleEvents.id }))
    if (!claimed) continue
    await enqueueNotification({ tenantId: row.occurrence.tenantId, userIds: [row.assignee.userId], category: 'hospitality', type: `hospitality.task.${stage}`, title: `${stage === 'overdue_notification' ? 'Overdue' : 'Upcoming'} task: ${row.template.title}`, body: `${row.property.name} · due ${row.occurrence.dueAt.toISOString()}`, linkPath: `/hospitality/properties/${row.property.id}/diary`, data: { occurrenceId: row.occurrence.id, propertyId: row.property.id, stage } }, { jobId: `hospitality-task|${row.occurrence.id}|${stage}|${row.assignee.userId}` })
    processed += 1
  }
  // No property-manager model exists in this domain yet. Tenant members with
  // the existing hospitality.manage permission are the conservative manager
  // audience, filtered by active membership and tenant-local role assignment.
  const overdue = candidates.filter((row) => row.occurrence.dueAt.getTime() <= now.getTime() - OPERATIONAL_TASK_LIFECYCLE.managerOverdueMinutes * 60_000)
  for (const row of overdue) {
    const managers = await withSuperAdmin(db, (tx) => tx.selectDistinct({ userId: tenantUsers.userId }).from(tenantUsers).innerJoin(roleAssignments, and(eq(roleAssignments.tenantId, tenantUsers.tenantId), eq(roleAssignments.tenantUserId, tenantUsers.id))).innerJoin(roles, and(eq(roles.tenantId, roleAssignments.tenantId), eq(roles.id, roleAssignments.roleId))).where(and(eq(tenantUsers.tenantId, row.occurrence.tenantId), eq(tenantUsers.status, 'active'), sql`${roles.permissions} @> '["hospitality.manage"]'::jsonb`)))
    for (const manager of managers) {
      const [claimed] = await withSuperAdmin(db, (tx) => tx.insert(operationalTaskLifecycleEvents).values({ tenantId: row.occurrence.tenantId, occurrenceId: row.occurrence.id, stage: 'manager_notification', recipientUserId: manager.userId, metadata: { propertyId: row.property.id } }).onConflictDoNothing().returning({ id: operationalTaskLifecycleEvents.id }))
      if (!claimed) continue
      await enqueueNotification({ tenantId: row.occurrence.tenantId, userIds: [manager.userId], category: 'hospitality', type: 'hospitality.task.manager_notification', title: `Manager escalation: ${row.template.title}`, body: `${row.property.name} task remains overdue since ${row.occurrence.dueAt.toISOString()}`, linkPath: `/hospitality/properties/${row.property.id}/diary`, data: { occurrenceId: row.occurrence.id, propertyId: row.property.id, stage: 'manager_notification' } }, { jobId: `hospitality-task|${row.occurrence.id}|manager|${manager.userId}` })
      processed += 1
    }
    if (row.occurrence.dueAt.getTime() <= now.getTime() - OPERATIONAL_TASK_LIFECYCLE.finalEscalationMinutes * 60_000) {
      const [claimed] = await withSuperAdmin(db, (tx) => tx.insert(operationalTaskLifecycleEvents).values({ tenantId: row.occurrence.tenantId, occurrenceId: row.occurrence.id, stage: 'escalated', metadata: { propertyId: row.property.id } }).onConflictDoNothing().returning({ id: operationalTaskLifecycleEvents.id }))
      if (claimed) processed += 1
    }
  }
  return { candidates: candidates.length, processed }
}
