import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  archive: vi.fn(),
  provisionQr: vi.fn(),
  rotateQr: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.auth }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/hospitality/property-input', async () => import('./property-input'))
vi.mock('@/lib/hospitality/properties', () => ({
  createProperty: mocks.create,
  archiveProperty: mocks.archive,
  createBuilding: vi.fn(),
  createFloor: vi.fn(),
  createRoom: vi.fn(),
  updateBuilding: vi.fn(),
  updateFloor: vi.fn(),
  updateRoom: vi.fn(),
}))
vi.mock('@/lib/hospitality/maintenance', () => ({
  createRoomMaintenanceIssue: vi.fn(),
  updateMaintenanceIssue: vi.fn(),
}))
vi.mock('@/lib/hospitality/room-qr', () => ({
  provisionRoomQr: mocks.provisionQr,
  rotateRoomQr: mocks.rotateQr,
}))

import {
  archivePropertyAction,
  createPropertyAction,
  provisionRoomQrAction,
  rotateRoomQrAction,
} from '../../app/(app)/hospitality/properties/actions'

const context = { tenantId: 'tenant-current' }
const id = '20000000-0000-4000-8000-000000000001'
function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue(context)
  mocks.create.mockResolvedValue({ id })
  mocks.archive.mockResolvedValue({ id })
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`Redirect ${path}`)
  })
})

describe('property workflow actions', () => {
  it('uses the request context and redirects to the created property', async () => {
    await expect(
      createPropertyAction(
        {},
        form({ name: 'Hotel', code: 'LON', timezone: 'UTC', tenantId: 'another-tenant' }),
      ),
    ).rejects.toThrow(`Redirect /hospitality/properties/${id}`)
    expect(mocks.create).toHaveBeenCalledWith(context, {
      name: 'Hotel',
      code: 'LON',
      timezone: 'UTC',
    })
    expect(mocks.revalidate).toHaveBeenCalledWith('/hospitality/properties')
  })
  it('returns an actionable invalid-input state without writing', async () => {
    await expect(
      createPropertyAction({}, form({ name: '', code: 'LON', timezone: 'invalid' })),
    ).resolves.toEqual({ error: 'invalid_input' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not expose database or authorization exception details', async () => {
    mocks.create.mockRejectedValueOnce(new Error('internal database detail'))
    await expect(
      createPropertyAction({}, form({ name: 'Hotel', code: 'LON', timezone: 'UTC' })),
    ).resolves.toEqual({ error: 'create_failed' })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
  it('requires an explicit archive confirmation before invoking the service', async () => {
    await expect(archivePropertyAction(form({ id }))).rejects.toThrow(
      'Archive confirmation is required',
    )
    expect(mocks.archive).not.toHaveBeenCalled()
  })
  it('provisions and rotates a room QR in the authenticated tenant context', async () => {
    const route = {
      propertyId: id,
      buildingId: '20000000-0000-4000-8000-000000000002',
      floorId: '20000000-0000-4000-8000-000000000003',
      roomId: '20000000-0000-4000-8000-000000000004',
    }
    const path = `/hospitality/properties/${route.propertyId}/buildings/${route.buildingId}/floors/${route.floorId}/rooms/${route.roomId}`
    await expect(provisionRoomQrAction(form(route))).rejects.toThrow(`Redirect ${path}`)
    expect(mocks.provisionQr).toHaveBeenCalledWith(context, route.roomId)
    expect(mocks.revalidate).toHaveBeenCalledWith(path)

    await expect(rotateRoomQrAction(form(route))).rejects.toThrow(`Redirect ${path}`)
    expect(mocks.rotateQr).toHaveBeenCalledWith(context, route.roomId)
  })

  it('archives in the current context and refreshes the property and list', async () => {
    await expect(
      archivePropertyAction(form({ id, confirmation: 'archive', tenantId: 'another-tenant' })),
    ).rejects.toThrow('Redirect /hospitality/properties')
    expect(mocks.archive).toHaveBeenCalledWith(context, id)
    expect(mocks.revalidate).toHaveBeenCalledWith(`/hospitality/properties/${id}`, 'layout')
    expect(mocks.revalidate).toHaveBeenCalledWith('/hospitality/properties')
  })
})
