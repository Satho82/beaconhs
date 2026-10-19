import { Buffer } from 'node:buffer'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { attachmentUploadReservations } from '@beaconhs/db/schema'
import { putObject } from '@beaconhs/storage'
import { getRequestContext } from '@/lib/auth'
import { uploadContentDisposition, uploadedFileHeaderError } from '@/lib/upload-policy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const idSchema = z.string().uuid()

/**
 * Same-origin upload relay for single-part reservations. It verifies the active
 * tenant session and reservation before writing to private object storage, so
 * internal storage hostnames are never exposed to the browser.
 */
export async function PUT(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsedId = idSchema.safeParse((await routeContext.params).id)
  if (!parsedId.success) return new NextResponse('Not found', { status: 404 })

  const ctx = await getRequestContext()
  if (!ctx) return new NextResponse('Unauthorized', { status: 401 })

  const reservation = await ctx.db(async (tx) => {
    const [row] = await tx
      .select({
        requestedBy: attachmentUploadReservations.requestedBy,
        kind: attachmentUploadReservations.kind,
        stagingKey: attachmentUploadReservations.stagingKey,
        contentType: attachmentUploadReservations.contentType,
        sizeBytes: attachmentUploadReservations.sizeBytes,
        verificationTokenHash: attachmentUploadReservations.verificationTokenHash,
      })
      .from(attachmentUploadReservations)
      .where(
        and(
          eq(attachmentUploadReservations.id, parsedId.data),
          isNull(attachmentUploadReservations.consumedAt),
          gt(attachmentUploadReservations.expiresAt, new Date()),
        ),
      )
      .limit(1)
    return row ?? null
  })
  if (!reservation || reservation.requestedBy !== ctx.userId)
    return new NextResponse('Not found', { status: 404 })

  const declaredLength = Number(request.headers.get('content-length'))
  if (!Number.isSafeInteger(declaredLength) || declaredLength !== reservation.sizeBytes) {
    return new NextResponse('Upload size does not match the reservation', { status: 400 })
  }
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.split(';', 1)[0]!.trim().toLowerCase() !== reservation.contentType.toLowerCase()) {
    return new NextResponse('Upload type does not match the reservation', { status: 400 })
  }

  const body = Buffer.from(await request.arrayBuffer())
  if (body.byteLength !== reservation.sizeBytes)
    return new NextResponse('Upload size does not match the reservation', { status: 400 })
  const headerError = uploadedFileHeaderError(reservation.kind, reservation.contentType, body)
  if (headerError) return new NextResponse(headerError, { status: 400 })

  await putObject({
    key: reservation.stagingKey,
    body,
    contentType: reservation.contentType,
    contentDisposition: uploadContentDisposition(reservation.kind, reservation.contentType),
    metadata: { 'upload-token-sha256': reservation.verificationTokenHash },
  })
  return new NextResponse(null, { status: 204 })
}
