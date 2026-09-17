import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm'
import {
  auditLog,
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssues,
  qrTargets,
  tenantModuleEntitlements,
  tenants,
} from '@beaconhs/db/schema'
import { db, withSuperAdmin, withTenant } from '@beaconhs/db'
import { consumeRateLimit } from '@beaconhs/jobs/rate-limit'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const priorities = new Set(['low', 'medium', 'high'])

type GuestRoomTarget = {
  tenantId: string
  roomId: string
  roomCode: string
  roomName: string | null
  propertyName: string
}
type GuestMaintenanceInput = {
  token: string
  submissionId: string
  category: string
  description: string
  priority: string
  guestName: string
  guestContact: string
  contactConsent: boolean
  website: string
}

export function createRoomQrToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isRoomQrToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

function bounded(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

export function parseGuestMaintenanceInput(input: Record<string, unknown>): GuestMaintenanceInput {
  const parsed = {
    token: bounded(input.token, 64),
    submissionId: bounded(input.submissionId, 40),
    category: bounded(input.category, 80),
    description: bounded(input.description, 2_000),
    priority: bounded(input.priority, 16),
    guestName: bounded(input.guestName, 120),
    guestContact: bounded(input.guestContact, 240),
    contactConsent: input.contactConsent === true || input.contactConsent === 'on',
    website: bounded(input.website, 200),
  }
  if (!isRoomQrToken(parsed.token)) throw new Error('This room QR code is invalid.')
  if (!UUID_PATTERN.test(parsed.submissionId))
    throw new Error('Please refresh the page and try again.')
  if (!parsed.category) throw new Error('Choose the type of issue.')
  if (parsed.description.length < 5) throw new Error('Please add a little more detail.')
  if (!priorities.has(parsed.priority)) throw new Error('Choose a valid urgency.')
  if (parsed.guestContact && !parsed.contactConsent)
    throw new Error('Consent is required before contact details can be shared.')
  if (!parsed.guestContact) parsed.contactConsent = false
  return parsed
}

export async function resolveGuestRoomTarget(token: string, now = new Date()) {
  if (!isRoomQrToken(token)) return null
  return withSuperAdmin(db, async (tx): Promise<GuestRoomTarget | null> => {
    const [row] = await tx
      .select({
        tenantId: qrTargets.tenantId,
        roomId: hospitalityRooms.id,
        roomCode: hospitalityRooms.code,
        roomName: hospitalityRooms.name,
        propertyName: hospitalityProperties.name,
      })
      .from(qrTargets)
      .innerJoin(tenants, eq(tenants.id, qrTargets.tenantId))
      .innerJoin(
        hospitalityRooms,
        and(
          eq(hospitalityRooms.tenantId, qrTargets.tenantId),
          eq(hospitalityRooms.id, qrTargets.roomId),
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
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, hospitalityBuildings.tenantId),
          eq(hospitalityProperties.id, hospitalityBuildings.propertyId),
        ),
      )
      .innerJoin(
        tenantModuleEntitlements,
        and(
          eq(tenantModuleEntitlements.tenantId, qrTargets.tenantId),
          eq(tenantModuleEntitlements.moduleKey, 'hospitality.maintenance'),
          eq(tenantModuleEntitlements.state, 'enabled'),
          or(
            isNull(tenantModuleEntitlements.effectiveFrom),
            lte(tenantModuleEntitlements.effectiveFrom, now),
          ),
          or(
            isNull(tenantModuleEntitlements.effectiveUntil),
            gt(tenantModuleEntitlements.effectiveUntil, now),
          ),
        ),
      )
      .where(
        and(
          eq(qrTargets.token, token),
          eq(tenants.status, 'active'),
          eq(qrTargets.kind, 'room'),
          eq(qrTargets.isActive, true),
          isNull(hospitalityRooms.deletedAt),
          isNull(hospitalityFloors.deletedAt),
          isNull(hospitalityBuildings.deletedAt),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1)
    return row ?? null
  })
}

export async function submitGuestMaintenanceIssue(
  input: GuestMaintenanceInput,
  fingerprint: string,
) {
  if (input.website) return { ok: true as const, reference: 'received' }
  const rateKey = createHash('sha256').update(`${input.token}:${fingerprint}`).digest('hex')
  let limit
  try {
    limit = await consumeRateLimit({
      key: `guest-room:${rateKey}`,
      limit: 5,
      windowSeconds: 15 * 60,
    })
  } catch {
    throw new Error('Reporting is temporarily unavailable. Please contact reception.')
  }
  if (!limit.allowed) throw new Error('Too many reports were sent. Please contact reception.')
  const target = await resolveGuestRoomTarget(input.token)
  if (!target) throw new Error('This room reporting link is unavailable.')
  return withTenant(db, target.tenantId, async (tx) => {
    const [existing] = await tx
      .select({ reference: maintenanceIssues.reference })
      .from(maintenanceIssues)
      .where(
        and(
          eq(maintenanceIssues.tenantId, target.tenantId),
          eq(maintenanceIssues.publicSubmissionId, input.submissionId),
        ),
      )
      .limit(1)
    if (existing) return { ok: true as const, reference: existing.reference }

    const reference =
      `MI-${Date.now().toString(36).toUpperCase()}-` + randomBytes(3).toString('hex').toUpperCase()
    const [issue] = await tx
      .insert(maintenanceIssues)
      .values({
        tenantId: target.tenantId,
        roomId: target.roomId,
        reference,
        source: 'guest_qr',
        status: 'reported',
        priority: input.priority,
        summary: input.category,
        description: input.description,
        publicSubmissionId: input.submissionId,
        guestName: input.guestName || null,
        guestContact: input.guestContact || null,
        guestContactConsent: input.contactConsent,
      })
      .onConflictDoNothing({
        target: [maintenanceIssues.tenantId, maintenanceIssues.publicSubmissionId],
      })
      .returning({ id: maintenanceIssues.id, reference: maintenanceIssues.reference })
    if (!issue) {
      const [duplicate] = await tx
        .select({ reference: maintenanceIssues.reference })
        .from(maintenanceIssues)
        .where(
          and(
            eq(maintenanceIssues.tenantId, target.tenantId),
            eq(maintenanceIssues.publicSubmissionId, input.submissionId),
          ),
        )
        .limit(1)
      if (duplicate) return { ok: true as const, reference: duplicate.reference }
      throw new Error('The issue could not be recorded.')
    }
    await tx.insert(auditLog).values({
      tenantId: target.tenantId,
      actorUserId: null,
      entityType: 'maintenance_issue',
      entityId: issue.id,
      action: 'create',
      summary: `Guest QR report ${issue.reference} received for room ${target.roomCode}`,
      metadata: { source: 'guest_qr', roomId: target.roomId },
    })
    return { ok: true as const, reference: issue.reference }
  })
}
