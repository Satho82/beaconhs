import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import {
  correctiveActions,
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityHandoverAcknowledgements,
  hospitalityHandoverAttachments,
  hospitalityHandoverComments,
  hospitalityHandovers,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssues,
  roleAssignments,
  tenantUsers,
  users,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from '@/lib/audit'
import { canReadActionAttachment } from '@/lib/action-attachment-access'
import { nextReference } from '@/lib/reference'
import { validateTenantImageAttachmentIdsInTx } from '@/lib/attachment-validation'
import { assertCanAccessProperty } from './property-access'

export type HandoverShift = 'am' | 'pm' | 'night' | 'custom'
export type HandoverPriority = 'routine' | 'important' | 'urgent'
export type HandoverFollowUpStatus = 'not_required' | 'open' | 'in_progress' | 'completed'

export type CreateHandoverInput = {
  propertyId: string
  occurredAt: Date
  shift: HandoverShift
  customShift?: string
  department: string
  note: string
  priority: HandoverPriority
  roomId?: string
  location?: string
  followUpRequired?: boolean
  followUpOwnerId?: string
  maintenanceIssueId?: string
  createCorrectiveAction?: boolean
  attachmentIds?: string[]
}

function required(value: string | undefined, label: string, max = 10_000) {
  const clean = value?.trim() ?? ''
  if (!clean) throw new Error(`${label} is required.`)
  if (clean.length > max) throw new Error(`${label} is too long.`)
  return clean
}

function memberId(ctx: RequestContext) {
  if (!ctx.membership?.id) throw new Error('An active tenant membership is required.')
  return ctx.membership.id
}

function readGate(ctx: RequestContext) {
  assertCan(ctx, 'hospitality.read')
}

function writeGate(ctx: RequestContext) {
  assertCan(ctx, 'hospitality.manage')
}

async function assertPropertyExists(ctx: RequestContext, propertyId: string) {
  assertCanAccessProperty(ctx, propertyId)
  const [row] = await ctx.db((tx) =>
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
  if (!row) throw new Error('Property is unavailable.')
}

async function assertMemberForProperty(
  tx: Parameters<Parameters<RequestContext['db']>[0]>[0],
  tenantId: string,
  tenantUserId: string | undefined,
  propertyId: string,
) {
  if (!tenantUserId) return null
  const [member] = await tx
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(
      and(
        eq(tenantUsers.tenantId, tenantId),
        eq(tenantUsers.id, tenantUserId),
        eq(tenantUsers.status, 'active'),
      ),
    )
    .limit(1)
  if (!member) throw new Error('Follow-up owner is not an active workspace member.')
  const assignments = await tx
    .select({ scope: roleAssignments.scope })
    .from(roleAssignments)
    .where(
      and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.tenantUserId, tenantUserId)),
    )
  const allowed = assignments.some((row) => {
    if (row.scope.type === 'tenant') return true
    return row.scope.type === 'properties' && row.scope.propertyIds.includes(propertyId)
  })
  if (!allowed) throw new Error('Follow-up owner is not assigned to this property.')
  return member.id
}

async function assertRoomForProperty(
  tx: Parameters<Parameters<RequestContext['db']>[0]>[0],
  tenantId: string,
  roomId: string | undefined,
  propertyId: string,
) {
  if (!roomId) return null
  const [room] = await tx
    .select({ id: hospitalityRooms.id })
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
        eq(hospitalityRooms.tenantId, tenantId),
        eq(hospitalityRooms.id, roomId),
        eq(hospitalityBuildings.propertyId, propertyId),
      ),
    )
    .limit(1)
  if (!room) throw new Error('Room does not belong to the selected property.')
  return room.id
}

async function assertMaintenanceForProperty(
  tx: Parameters<Parameters<RequestContext['db']>[0]>[0],
  tenantId: string,
  issueId: string | undefined,
  propertyId: string,
) {
  if (!issueId) return null
  const [issue] = await tx
    .select({ id: maintenanceIssues.id })
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
    .where(
      and(
        eq(maintenanceIssues.tenantId, tenantId),
        eq(maintenanceIssues.id, issueId),
        eq(hospitalityBuildings.propertyId, propertyId),
      ),
    )
    .limit(1)
  if (!issue) throw new Error('Maintenance issue does not belong to the selected property.')
  return issue.id
}

export async function createHandover(ctx: RequestContext, input: CreateHandoverInput) {
  writeGate(ctx)
  await assertPropertyExists(ctx, input.propertyId)
  const authorId = memberId(ctx)
  if (!Number.isFinite(input.occurredAt.getTime())) throw new Error('Date and time are invalid.')
  const department = required(input.department, 'Department', 100)
  const note = required(input.note, 'Handover note')
  const customShift =
    input.shift === 'custom' ? required(input.customShift, 'Custom shift', 100) : null
  const location = input.location?.trim() || null
  const followUpRequired = Boolean(input.followUpRequired)
  return ctx.db(async (tx) => {
    const roomId = await assertRoomForProperty(tx, ctx.tenantId, input.roomId, input.propertyId)
    const ownerId = followUpRequired
      ? await assertMemberForProperty(tx, ctx.tenantId, input.followUpOwnerId, input.propertyId)
      : null
    const maintenanceIssueId = await assertMaintenanceForProperty(
      tx,
      ctx.tenantId,
      input.maintenanceIssueId,
      input.propertyId,
    )
    const [handover] = await tx
      .insert(hospitalityHandovers)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        occurredAt: input.occurredAt,
        shift: input.shift,
        customShift,
        department,
        note,
        priority: input.priority,
        authorId,
        roomId,
        location,
        followUpRequired,
        followUpOwnerId: ownerId,
        followUpStatus: followUpRequired ? 'open' : 'not_required',
        maintenanceIssueId,
      })
      .returning()
    if (!handover) throw new Error('Handover entry could not be created.')

    let correctiveActionId: string | null = null
    if (input.createCorrectiveAction) {
      const reference = await nextReference(tx, ctx.tenantId, 'corrective_action')
      const [action] = await tx
        .insert(correctiveActions)
        .values({
          tenantId: ctx.tenantId,
          reference,
          title: `Handover: ${department}`,
          description: note,
          severity:
            input.priority === 'urgent'
              ? 'high'
              : input.priority === 'important'
                ? 'medium'
                : 'low',
          status: 'open',
          source: 'observation',
          sourceEntityType: 'hospitality_handover',
          sourceEntityId: handover.id,
          assignedOn: new Date().toISOString().slice(0, 10),
          assignedByTenantUserId: authorId,
          ownerTenantUserId: ownerId ?? authorId,
          metadata: { propertyId: input.propertyId },
        })
        .returning({ id: correctiveActions.id })
      correctiveActionId = action?.id ?? null
      if (!correctiveActionId) throw new Error('Corrective action could not be created.')
      await tx
        .update(hospitalityHandovers)
        .set({ correctiveActionId })
        .where(
          and(
            eq(hospitalityHandovers.tenantId, ctx.tenantId),
            eq(hospitalityHandovers.id, handover.id),
          ),
        )
    }

    const attachmentIds = await validateTenantImageAttachmentIdsInTx(
      tx,
      ctx.tenantId,
      input.attachmentIds ?? [],
    )
    if (attachmentIds.length) {
      await tx.insert(hospitalityHandoverAttachments).values(
        attachmentIds.map((attachmentId) => ({
          tenantId: ctx.tenantId,
          handoverId: handover.id,
          attachmentId,
          uploadedById: authorId,
        })),
      )
    }
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_handover',
      entityId: handover.id,
      action: 'create',
      summary: `Created ${input.shift} handover for ${department}`,
      after: {
        propertyId: input.propertyId,
        priority: input.priority,
        maintenanceIssueId,
        correctiveActionId,
      },
    })
    return { ...handover, correctiveActionId }
  })
}

async function visibleHandover(ctx: RequestContext, handoverId: string) {
  readGate(ctx)
  const [row] = await ctx.db((tx) =>
    tx
      .select()
      .from(hospitalityHandovers)
      .where(
        and(
          eq(hospitalityHandovers.tenantId, ctx.tenantId),
          eq(hospitalityHandovers.id, handoverId),
        ),
      )
      .limit(1),
  )
  if (!row) throw new Error('Handover entry not found.')
  assertCanAccessProperty(ctx, row.propertyId)
  return row
}

export async function acknowledgeHandover(ctx: RequestContext, handoverId: string) {
  const row = await visibleHandover(ctx, handoverId)
  const authorId = memberId(ctx)
  await ctx.db(async (tx) => {
    await tx
      .insert(hospitalityHandoverAcknowledgements)
      .values({ tenantId: ctx.tenantId, handoverId, authorId })
      .onConflictDoNothing()
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_handover',
      entityId: handoverId,
      action: 'update',
      summary: 'Acknowledged handover entry',
      after: { propertyId: row.propertyId },
    })
  })
}

export async function commentOnHandover(ctx: RequestContext, handoverId: string, body: string) {
  writeGate(ctx)
  const row = await visibleHandover(ctx, handoverId)
  const authorId = memberId(ctx)
  const clean = required(body, 'Comment')
  await ctx.db(async (tx) => {
    await tx
      .insert(hospitalityHandoverComments)
      .values({ tenantId: ctx.tenantId, handoverId, authorId, body: clean })
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_handover',
      entityId: handoverId,
      action: 'update',
      summary: 'Added a handover update',
      after: { propertyId: row.propertyId },
    })
  })
}

export async function attachHandoverPhotos(
  ctx: RequestContext,
  handoverId: string,
  attachmentIds: string[],
) {
  writeGate(ctx)
  await visibleHandover(ctx, handoverId)
  for (const attachmentId of attachmentIds) {
    if (!(await canReadActionAttachment(ctx, attachmentId))) {
      throw new Error('Photo is unavailable in this property scope.')
    }
  }
  const uploadedById = memberId(ctx)
  await ctx.db(async (tx) => {
    const validIds = await validateTenantImageAttachmentIdsInTx(tx, ctx.tenantId, attachmentIds)
    if (!validIds.length) return
    await tx
      .insert(hospitalityHandoverAttachments)
      .values(
        validIds.map((attachmentId) => ({
          tenantId: ctx.tenantId,
          handoverId,
          attachmentId,
          uploadedById,
        })),
      )
      .onConflictDoNothing()
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_handover',
      entityId: handoverId,
      action: 'update',
      summary: `Attached ${validIds.length} handover photo(s)`,
    })
  })
}

export async function updateHandoverFollowUp(
  ctx: RequestContext,
  handoverId: string,
  status: Exclude<HandoverFollowUpStatus, 'not_required'>,
) {
  writeGate(ctx)
  const row = await visibleHandover(ctx, handoverId)
  if (!row.followUpRequired) throw new Error('This entry does not require follow-up.')
  await ctx.db(async (tx) => {
    await tx
      .update(hospitalityHandovers)
      .set({ followUpStatus: status, updatedAt: new Date() })
      .where(
        and(
          eq(hospitalityHandovers.tenantId, ctx.tenantId),
          eq(hospitalityHandovers.id, handoverId),
        ),
      )
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_handover',
      entityId: handoverId,
      action: 'update',
      summary: `Changed follow-up to ${status}`,
      before: { followUpStatus: row.followUpStatus },
      after: { followUpStatus: status, propertyId: row.propertyId },
    })
  })
}

export async function carryForwardHandover(ctx: RequestContext, handoverId: string) {
  writeGate(ctx)
  const row = await visibleHandover(ctx, handoverId)
  if (row.priority === 'routine' || !row.followUpRequired || row.followUpStatus === 'completed') {
    throw new Error('Only unresolved important or urgent entries can be carried forward.')
  }
  const authorId = memberId(ctx)
  return ctx.db(async (tx) => {
    const [copy] = await tx
      .insert(hospitalityHandovers)
      .values({
        tenantId: ctx.tenantId,
        propertyId: row.propertyId,
        occurredAt: new Date(),
        shift: row.shift,
        customShift: row.customShift,
        department: row.department,
        note: row.note,
        priority: row.priority,
        authorId,
        roomId: row.roomId,
        location: row.location,
        followUpRequired: true,
        followUpOwnerId: row.followUpOwnerId,
        followUpStatus: 'open',
        carriedFromId: row.id,
        maintenanceIssueId: row.maintenanceIssueId,
        correctiveActionId: row.correctiveActionId,
      })
      .returning()
    if (!copy) throw new Error('Handover entry could not be carried forward.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'hospitality_handover',
      entityId: copy.id,
      action: 'create',
      summary: 'Carried unresolved handover entry forward',
      after: { propertyId: row.propertyId, carriedFromId: row.id },
    })
    return copy
  })
}

export async function listHandovers(
  ctx: RequestContext,
  options: { propertyId?: string | null; q?: string; page: number; perPage: number },
) {
  readGate(ctx)
  if (options.propertyId) assertCanAccessProperty(ctx, options.propertyId)
  const where = and(
    eq(hospitalityHandovers.tenantId, ctx.tenantId),
    options.propertyId ? eq(hospitalityHandovers.propertyId, options.propertyId) : undefined,
    options.q
      ? or(
          ilike(hospitalityHandovers.note, `%${options.q}%`),
          ilike(hospitalityHandovers.department, `%${options.q}%`),
          ilike(hospitalityHandovers.location, `%${options.q}%`),
          ilike(hospitalityProperties.name, `%${options.q}%`),
        )
      : undefined,
  )
  return ctx.db(async (tx) => {
    const base = tx
      .select({
        handover: hospitalityHandovers,
        propertyName: hospitalityProperties.name,
        roomCode: hospitalityRooms.code,
        authorName: users.name,
      })
      .from(hospitalityHandovers)
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, hospitalityHandovers.tenantId),
          eq(hospitalityProperties.id, hospitalityHandovers.propertyId),
        ),
      )
      .leftJoin(
        hospitalityRooms,
        and(
          eq(hospitalityRooms.tenantId, hospitalityHandovers.tenantId),
          eq(hospitalityRooms.id, hospitalityHandovers.roomId),
        ),
      )
      .innerJoin(
        tenantUsers,
        and(
          eq(tenantUsers.tenantId, hospitalityHandovers.tenantId),
          eq(tenantUsers.id, hospitalityHandovers.authorId),
        ),
      )
      .innerJoin(users, eq(users.id, tenantUsers.userId))
    const rows = await base
      .where(where)
      .orderBy(desc(hospitalityHandovers.occurredAt), desc(hospitalityHandovers.id))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage)
    const [total] = await tx
      .select({ value: count() })
      .from(hospitalityHandovers)
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, hospitalityHandovers.tenantId),
          eq(hospitalityProperties.id, hospitalityHandovers.propertyId),
        ),
      )
      .where(where)
    const ids = rows.map((row) => row.handover.id)
    if (!ids.length) return { rows: [], total: Number(total?.value ?? 0) }
    const [comments, acknowledgements] = await Promise.all([
      tx
        .select({ handoverId: hospitalityHandoverComments.handoverId, value: count() })
        .from(hospitalityHandoverComments)
        .where(inArray(hospitalityHandoverComments.handoverId, ids))
        .groupBy(hospitalityHandoverComments.handoverId),
      tx
        .select({ handoverId: hospitalityHandoverAcknowledgements.handoverId, value: count() })
        .from(hospitalityHandoverAcknowledgements)
        .where(inArray(hospitalityHandoverAcknowledgements.handoverId, ids))
        .groupBy(hospitalityHandoverAcknowledgements.handoverId),
    ])
    const commentMap = new Map(comments.map((row) => [row.handoverId, Number(row.value)]))
    const acknowledgementMap = new Map(
      acknowledgements.map((row) => [row.handoverId, Number(row.value)]),
    )
    return {
      rows: rows.map((row) => ({
        ...row,
        comments: commentMap.get(row.handover.id) ?? 0,
        acknowledgements: acknowledgementMap.get(row.handover.id) ?? 0,
      })),
      total: Number(total?.value ?? 0),
    }
  })
}

export async function handoverFormOptions(ctx: RequestContext, propertyIds: string[]) {
  readGate(ctx)
  if (!propertyIds.length) return { rooms: [], members: [], maintenance: [] }
  return ctx.db(async (tx) => {
    const rooms = await tx
      .select({
        id: hospitalityRooms.id,
        code: hospitalityRooms.code,
        name: hospitalityRooms.name,
        propertyId: hospitalityBuildings.propertyId,
      })
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
          inArray(hospitalityBuildings.propertyId, propertyIds),
        ),
      )
      .orderBy(asc(hospitalityRooms.code))
    const members = await tx
      .select({ id: tenantUsers.id, name: users.name })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.status, 'active')))
      .orderBy(asc(users.name))
    const maintenance = await tx
      .select({
        id: maintenanceIssues.id,
        reference: maintenanceIssues.reference,
        summary: maintenanceIssues.summary,
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
      .where(
        and(
          eq(maintenanceIssues.tenantId, ctx.tenantId),
          inArray(hospitalityBuildings.propertyId, propertyIds),
        ),
      )
      .orderBy(desc(maintenanceIssues.createdAt))
      .limit(100)
    return { rooms, members, maintenance }
  })
}
