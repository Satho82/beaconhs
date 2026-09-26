import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import {
  maintenanceIssueAttachments,
  maintenanceIssues,
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityRooms,
  tenantUsers,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { recordAudit } from '@/lib/audit'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'
import { validateTenantImageAttachmentIdsInTx } from '@/lib/attachment-validation'
import { assertCanUseEvidenceAttachments } from '@/lib/attachment-evidence-access'
const priorities = new Set(['low', 'medium', 'high', 'critical'])
export const MAINTENANCE_STATUSES = [
  'reported',
  'acknowledged',
  'assigned',
  'in_progress',
  'awaiting_parts',
  'completed',
  'closed',
  'cancelled',
] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

const transitions: Record<string, readonly MaintenanceStatus[]> = {
  reported: ['acknowledged', 'assigned', 'cancelled'],
  acknowledged: ['assigned', 'in_progress', 'cancelled'],
  assigned: ['in_progress', 'awaiting_parts', 'completed', 'cancelled'],
  in_progress: ['awaiting_parts', 'completed', 'cancelled'],
  awaiting_parts: ['in_progress', 'completed', 'cancelled'],
  completed: ['closed', 'in_progress'],
  closed: [],
  cancelled: ['reported'],
  triaged: ['assigned', 'in_progress', 'cancelled'],
  work_ordered: ['assigned', 'in_progress', 'completed', 'cancelled'],
}

export function canTransitionMaintenanceIssue(from: string, to: string): boolean {
  return from === to || (transitions[from]?.includes(to as MaintenanceStatus) ?? false)
}

async function gate(ctx: RequestContext, write = false) {
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, write ? 'maintenance.update' : 'maintenance.read')
}
export async function createRoomMaintenanceIssue(
  ctx: RequestContext,
  roomId: string,
  title: string,
  description: string,
  priority: string,
  source: 'staff' | 'front_office' | 'manager' | 'engineering' | 'staff_qr' = 'staff',
  attachmentIds: readonly string[] = [],
) {
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, 'maintenance.create')
  if (!priorities.has(priority)) throw new Error('Invalid maintenance priority')
  const summary = title.trim()
  const details = description.trim()
  if (!summary || summary.length > 200) throw new Error('Maintenance summary is required')
  if (details.length > 2_000) throw new Error('Maintenance description is too long')
  const [room] = await ctx.db((tx) =>
    tx
      .select({ id: hospitalityRooms.id, propertyId: hospitalityBuildings.propertyId })
      .from(hospitalityRooms)
      .innerJoin(
        hospitalityFloors,
        and(
          eq(hospitalityFloors.tenantId, hospitalityRooms.tenantId),
          eq(hospitalityFloors.id, hospitalityRooms.floorId),
        ),
      )
      .innerJoin(
        hospitalityBuildings,
        and(
          eq(hospitalityBuildings.tenantId, hospitalityFloors.tenantId),
          eq(hospitalityBuildings.id, hospitalityFloors.buildingId),
        ),
      )
      .where(
        and(
          eq(hospitalityRooms.tenantId, ctx.tenantId),
          eq(hospitalityRooms.id, roomId),
          isNull(hospitalityRooms.deletedAt),
        ),
      )
      .limit(1),
  )
  if (!room) throw new Error('No room exists in this tenant')
  assertCanAccessProperty(ctx, room.propertyId)
  await assertCanUseEvidenceAttachments(ctx, attachmentIds)
  const [r] = await ctx.db(async (tx) => {
    const photos = await validateTenantImageAttachmentIdsInTx(tx, ctx.tenantId, attachmentIds)
    const created = await tx
      .insert(maintenanceIssues)
      .values({
        tenantId: ctx.tenantId,
        roomId,
        reference:
          `MI-${Date.now().toString(36).toUpperCase()}-` +
          randomBytes(3).toString('hex').toUpperCase(),
        summary,
        description: details || null,
        priority,
        source,
        reportedByTenantUserId: ctx.membership?.id ?? null,
      })
      .returning()
    const issue = created[0]
    if (issue && photos.length) {
      await tx.insert(maintenanceIssueAttachments).values(
        photos.map((attachmentId) => ({
          tenantId: ctx.tenantId,
          issueId: issue.id,
          attachmentId,
          stage: 'reported',
          source: 'staff',
          uploadedByTenantUserId: ctx.membership?.id ?? null,
        })),
      )
    }
    return created
  })
  if (!r) throw new Error('Issue creation failed')
  await recordAudit(ctx, {
    entityType: 'maintenance_issue',
    entityId: r.id,
    action: 'create',
    summary: `Reported maintenance issue ${r.reference}`,
  })
  return r
}
export async function updateMaintenanceIssue(
  ctx: RequestContext,
  id: string,
  priority: string,
  status: string,
  resolutionNotes: string,
  assignee?: string,
) {
  await gate(ctx, true)
  if (!priorities.has(priority)) throw new Error('Invalid maintenance priority')
  if (!MAINTENANCE_STATUSES.includes(status as MaintenanceStatus))
    throw new Error('Invalid maintenance status')
  const notes = resolutionNotes.trim()
  if (notes.length > 2_000) throw new Error('Resolution notes are too long')
  const [current] = await ctx.db((tx) =>
    tx
      .select({
        status: maintenanceIssues.status,
        completedAt: maintenanceIssues.completedAt,
        completedByTenantUserId: maintenanceIssues.completedByTenantUserId,
        propertyId: hospitalityBuildings.propertyId,
      })
      .from(maintenanceIssues)
      .innerJoin(
        hospitalityRooms,
        and(
          eq(hospitalityRooms.tenantId, maintenanceIssues.tenantId),
          eq(hospitalityRooms.id, maintenanceIssues.roomId),
        ),
      )
      .innerJoin(
        hospitalityFloors,
        and(
          eq(hospitalityFloors.tenantId, hospitalityRooms.tenantId),
          eq(hospitalityFloors.id, hospitalityRooms.floorId),
        ),
      )
      .innerJoin(
        hospitalityBuildings,
        and(
          eq(hospitalityBuildings.tenantId, hospitalityFloors.tenantId),
          eq(hospitalityBuildings.id, hospitalityFloors.buildingId),
        ),
      )
      .where(and(eq(maintenanceIssues.tenantId, ctx.tenantId), eq(maintenanceIssues.id, id)))
      .limit(1),
  )
  if (!current) throw new Error('No maintenance issue exists in this tenant')
  assertCanAccessProperty(ctx, current.propertyId)
  if (!canTransitionMaintenanceIssue(current.status, status))
    throw new Error(`Cannot move maintenance from ${current.status} to ${status}`)
  if (status === 'assigned' && !assignee) throw new Error('Choose an assignee first')
  if ((status === 'completed' || status === 'closed') && !notes)
    throw new Error('Resolution notes are required before completion')
  if (assignee) {
    const [u] = await ctx.db((tx) =>
      tx
        .select({ id: tenantUsers.id })
        .from(tenantUsers)
        .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.id, assignee)))
        .limit(1),
    )
    if (!u) throw new Error('Assignee does not belong to this tenant')
  }
  const complete = status === 'completed' || status === 'closed'
  const [r] = await ctx.db((tx) =>
    tx
      .update(maintenanceIssues)
      .set({
        priority,
        status: status as MaintenanceStatus,
        assignedToTenantUserId: assignee || null,
        resolutionNotes: notes || null,
        completedAt: complete ? (current.completedAt ?? new Date()) : null,
        completedByTenantUserId: complete
          ? (current.completedByTenantUserId ?? ctx.membership?.id ?? null)
          : null,
      })
      .where(and(eq(maintenanceIssues.tenantId, ctx.tenantId), eq(maintenanceIssues.id, id)))
      .returning(),
  )
  if (!r) throw new Error('No maintenance issue exists in this tenant')
  await recordAudit(ctx, {
    entityType: 'maintenance_issue',
    entityId: id,
    action: 'update',
    summary: `Updated maintenance issue ${r.reference}`,
  })
  return r
}

export const MAINTENANCE_EVIDENCE_STAGES = [
  'reported',
  'before_work',
  'after_work',
  'completion',
] as const
export type MaintenanceEvidenceStage = (typeof MAINTENANCE_EVIDENCE_STAGES)[number]

export async function attachMaintenanceEvidence(
  ctx: RequestContext,
  issueId: string,
  stage: MaintenanceEvidenceStage,
  attachmentIds: readonly string[],
  description = '',
) {
  await gate(ctx, true)
  if (!MAINTENANCE_EVIDENCE_STAGES.includes(stage)) throw new Error('Invalid evidence stage')
  if (!attachmentIds.length || attachmentIds.length > 20)
    throw new Error('Choose evidence to attach')
  const note = description.trim()
  if (note.length > 1000) throw new Error('Evidence description is too long')
  const [issue] = await ctx.db((tx) =>
    tx
      .select({ id: maintenanceIssues.id, propertyId: hospitalityBuildings.propertyId })
      .from(maintenanceIssues)
      .innerJoin(
        hospitalityRooms,
        and(
          eq(hospitalityRooms.tenantId, maintenanceIssues.tenantId),
          eq(hospitalityRooms.id, maintenanceIssues.roomId),
        ),
      )
      .innerJoin(
        hospitalityFloors,
        and(
          eq(hospitalityFloors.tenantId, hospitalityRooms.tenantId),
          eq(hospitalityFloors.id, hospitalityRooms.floorId),
        ),
      )
      .innerJoin(
        hospitalityBuildings,
        and(
          eq(hospitalityBuildings.tenantId, hospitalityFloors.tenantId),
          eq(hospitalityBuildings.id, hospitalityFloors.buildingId),
        ),
      )
      .where(and(eq(maintenanceIssues.tenantId, ctx.tenantId), eq(maintenanceIssues.id, issueId)))
      .limit(1),
  )
  if (!issue) throw new Error('No maintenance issue exists in this tenant')
  assertCanAccessProperty(ctx, issue.propertyId)
  await assertCanUseEvidenceAttachments(ctx, attachmentIds)
  await ctx.db(async (tx) => {
    const photos = await validateTenantImageAttachmentIdsInTx(tx, ctx.tenantId, attachmentIds)
    await tx.insert(maintenanceIssueAttachments).values(
      photos.map((attachmentId) => ({
        tenantId: ctx.tenantId,
        issueId,
        attachmentId,
        stage,
        source: 'staff',
        uploadedByTenantUserId: ctx.membership?.id ?? null,
        description: note || null,
      })),
    )
  })
  await recordAudit(ctx, {
    entityType: 'maintenance_issue',
    entityId: issueId,
    action: 'update',
    summary: `Attached ${attachmentIds.length} ${stage.replaceAll('_', ' ')} evidence item(s)`,
  })
}
