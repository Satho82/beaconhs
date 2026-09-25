import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm'
import {
  attachments,
  auditLog,
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssueAttachments,
  maintenanceIssues,
  qrTargets,
  tenantModuleEntitlements,
  tenants,
} from '@beaconhs/db/schema'
import { db, withSuperAdmin, withTenant } from '@beaconhs/db'
import { consumeRateLimit } from '@beaconhs/jobs/rate-limit'
import { isUuid } from '@/lib/list-params'
import { deleteObject, ensureBucket, newAttachmentKey, putObject } from '@beaconhs/storage'
import { optimizeUploadedImage } from '@/lib/image-upload-optimization'
import { uploadContentTypeError, uploadedFileHeaderError } from '@/lib/upload-policy'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
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
  if (
    !isUuid(parsed.submissionId) ||
    parsed.submissionId[14] !== '4' ||
    !'89ab'.includes(parsed.submissionId[19]!.toLowerCase())
  )
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

async function prepareGuestPhoto(tenantId: string, photo: File | null) {
  if (!photo || photo.size === 0) return null
  if (photo.size > 10 * 1024 * 1024) throw new Error('The photo is too large (maximum 10 MB).')
  const contentType = photo.type.toLowerCase()
  const typeError = uploadContentTypeError('image', contentType)
  if (typeError) throw new Error(typeError)
  const raw = Buffer.from(await photo.arrayBuffer())
  const headerError = uploadedFileHeaderError('image', contentType, raw.subarray(0, 512))
  if (headerError) throw new Error(headerError)
  const optimized = await optimizeUploadedImage({
    body: raw,
    contentType,
    filename: bounded(photo.name || 'guest-photo', 255),
  })
  await ensureBucket()
  const key = newAttachmentKey({
    tenantId,
    kind: 'image',
    filename: optimized.filename,
  })
  await putObject({
    key,
    body: optimized.body,
    contentType: optimized.contentType,
    contentDisposition: 'inline',
  })
  return { key, optimized }
}

export async function submitGuestMaintenanceIssue(
  input: GuestMaintenanceInput,
  fingerprint: string,
  photo: File | null = null,
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

  const existing = await withTenant(db, target.tenantId, async (tx) => {
    const [row] = await tx
      .select({ reference: maintenanceIssues.reference })
      .from(maintenanceIssues)
      .where(
        and(
          eq(maintenanceIssues.tenantId, target.tenantId),
          eq(maintenanceIssues.publicSubmissionId, input.submissionId),
        ),
      )
      .limit(1)
    return row ?? null
  })
  if (existing) return { ok: true as const, reference: existing.reference }

  const prepared = await prepareGuestPhoto(target.tenantId, photo)
  try {
    const outcome = await withTenant(db, target.tenantId, async (tx) => {
      const reference =
        `MI-${Date.now().toString(36).toUpperCase()}-` +
        randomBytes(3).toString('hex').toUpperCase()
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
        if (duplicate) return { reference: duplicate.reference, discardPrepared: true }
        throw new Error('The issue could not be recorded.')
      }
      if (prepared) {
        const [attachment] = await tx
          .insert(attachments)
          .values({
            tenantId: target.tenantId,
            uploadedBy: null,
            kind: 'image',
            r2Key: prepared.key,
            contentType: prepared.optimized.contentType,
            sizeBytes: prepared.optimized.sizeBytes,
            filename: prepared.optimized.filename,
            width: prepared.optimized.width,
            height: prepared.optimized.height,
          })
          .returning({ id: attachments.id })
        if (!attachment) throw new Error('The photo could not be recorded.')
        await tx.insert(maintenanceIssueAttachments).values({
          tenantId: target.tenantId,
          issueId: issue.id,
          attachmentId: attachment.id,
          stage: 'reported',
          source: 'guest_qr',
          uploadedByTenantUserId: null,
        })
      }
      await tx.insert(auditLog).values({
        tenantId: target.tenantId,
        actorUserId: null,
        entityType: 'maintenance_issue',
        entityId: issue.id,
        action: 'create',
        summary: `Guest QR report ${issue.reference} received for room ${target.roomCode}`,
        metadata: { source: 'guest_qr', roomId: target.roomId, evidence: Boolean(prepared) },
      })
      return { reference: issue.reference, discardPrepared: false }
    })
    if (prepared && outcome.discardPrepared) {
      await deleteObject({ key: prepared.key }).catch(() => undefined)
    }
    return { ok: true as const, reference: outcome.reference }
  } catch (error) {
    if (prepared) await deleteObject({ key: prepared.key }).catch(() => undefined)
    throw error
  }
}
