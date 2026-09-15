'use server'
import { propertyInputSchema, type PropertyFormState } from '@/lib/hospitality/property-input'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireRequestContext } from '@/lib/auth'
import {
  createProperty,
  createBuilding,
  createFloor,
  createRoom,
  archiveProperty,
} from '@/lib/hospitality/properties'
import { updateBuilding } from '@/lib/hospitality/properties'
import { updateFloor } from '@/lib/hospitality/properties'
import { updateRoom } from '@/lib/hospitality/properties'
import { createRoomMaintenanceIssue } from '@/lib/hospitality/maintenance'
import { updateMaintenanceIssue } from '@/lib/hospitality/maintenance'
import { provisionRoomQr, rotateRoomQr } from '@/lib/hospitality/room-qr'
const value = (f: FormData, key: string) => String(f.get(key) ?? '')
export async function createPropertyAction(
  _previous: PropertyFormState,
  f: FormData,
): Promise<PropertyFormState> {
  const ctx = await requireRequestContext()
  const parsed = propertyInputSchema.safeParse({
    name: value(f, 'name'),
    code: value(f, 'code'),
    timezone: value(f, 'timezone'),
  })
  if (!parsed.success) return { error: 'invalid_input' }
  let propertyId: string
  try {
    const row = await createProperty(ctx, parsed.data)
    propertyId = row.id
  } catch {
    return { error: 'create_failed' }
  }
  revalidatePath('/hospitality/properties')
  redirect(`/hospitality/properties/${propertyId}`)
}
export async function createBuildingAction(f: FormData) {
  const ctx = await requireRequestContext()
  const [row] = await createBuilding(
    ctx,
    value(f, 'propertyId'),
    value(f, 'name'),
    value(f, 'code'),
  )
  if (!row) throw new Error('Building creation failed')
  revalidatePath(`/hospitality/properties/${row.propertyId}`)
  redirect(`/hospitality/properties/${row.propertyId}/buildings/${row.id}`)
}
export async function createFloorAction(f: FormData) {
  const ctx = await requireRequestContext()
  const [r] = await createFloor(ctx, value(f, 'buildingId'), value(f, 'name'), value(f, 'code'))
  if (!r) throw new Error('Floor creation failed')
  redirect(
    `/hospitality/properties/${value(f, 'propertyId')}/buildings/${r.buildingId}/floors/${r.id}`,
  )
}
export async function createRoomAction(f: FormData) {
  const ctx = await requireRequestContext()
  const [r] = await createRoom(
    ctx,
    value(f, 'floorId'),
    value(f, 'code'),
    value(f, 'name'),
    value(f, 'roomType'),
  )
  if (!r) throw new Error('Room creation failed')
  redirect(
    `/hospitality/properties/${value(f, 'propertyId')}/buildings/${value(f, 'buildingId')}/floors/${r.floorId}/rooms/${r.id}`,
  )
}
export async function archivePropertyAction(f: FormData) {
  if (value(f, 'confirmation') !== 'archive') throw new Error('Archive confirmation is required.')
  const ctx = await requireRequestContext()
  await archiveProperty(ctx, value(f, 'id'))
  revalidatePath(`/hospitality/properties/${value(f, 'id')}`, 'layout')
  revalidatePath('/hospitality/properties')
  redirect('/hospitality/properties')
}
export async function updateBuildingAction(f: FormData) {
  const ctx = await requireRequestContext()
  const row = await updateBuilding(
    ctx,
    value(f, 'propertyId'),
    value(f, 'buildingId'),
    value(f, 'name'),
    value(f, 'code'),
  )
  revalidatePath(`/hospitality/properties/${row.propertyId}/buildings/${row.id}`)
  redirect(`/hospitality/properties/${row.propertyId}/buildings/${row.id}`)
}
export async function updateFloorAction(f: FormData) {
  const ctx = await requireRequestContext()
  const r = await updateFloor(
    ctx,
    value(f, 'buildingId'),
    value(f, 'floorId'),
    value(f, 'name'),
    value(f, 'code'),
  )
  redirect(
    `/hospitality/properties/${value(f, 'propertyId')}/buildings/${r.buildingId}/floors/${r.id}`,
  )
}
export async function updateRoomAction(f: FormData) {
  const ctx = await requireRequestContext()
  const r = await updateRoom(
    ctx,
    value(f, 'floorId'),
    value(f, 'roomId'),
    value(f, 'code'),
    value(f, 'name'),
    value(f, 'roomType'),
  )
  redirect(
    `/hospitality/properties/${value(f, 'propertyId')}/buildings/${value(f, 'buildingId')}/floors/${r.floorId}/rooms/${r.id}`,
  )
}
export async function reportMaintenanceIssueAction(f: FormData) {
  const ctx = await requireRequestContext()
  const r = await createRoomMaintenanceIssue(
    ctx,
    value(f, 'roomId'),
    value(f, 'title'),
    value(f, 'description'),
    value(f, 'priority'),
  )
  redirect(`/hospitality/maintenance/${r.id}`)
}
export async function updateMaintenanceIssueAction(f: FormData) {
  const ctx = await requireRequestContext()
  const r = await updateMaintenanceIssue(
    ctx,
    value(f, 'issueId'),
    value(f, 'priority'),
    value(f, 'status'),
    value(f, 'resolutionNotes'),
    value(f, 'assignee'),
  )
  redirect(`/hospitality/maintenance/${r.id}`)
}

function roomPath(f: FormData) {
  return `/hospitality/properties/${value(f, 'propertyId')}/buildings/${value(f, 'buildingId')}/floors/${value(f, 'floorId')}/rooms/${value(f, 'roomId')}`
}

export async function provisionRoomQrAction(f: FormData) {
  const ctx = await requireRequestContext()
  await provisionRoomQr(ctx, value(f, 'roomId'))
  revalidatePath(roomPath(f))
  redirect(roomPath(f))
}

export async function rotateRoomQrAction(f: FormData) {
  const ctx = await requireRequestContext()
  await rotateRoomQr(ctx, value(f, 'roomId'))
  revalidatePath(roomPath(f))
  redirect(roomPath(f))
}
