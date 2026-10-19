import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRequestContext: vi.fn(),
  putObject: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getRequestContext: mocks.getRequestContext }))
vi.mock('@beaconhs/storage', () => ({ putObject: mocks.putObject }))

import { NextRequest } from 'next/server'
import { PUT } from './route'

const id = '123e4567-e89b-12d3-a456-426614174000'

function request(body = 'hello', contentType = 'application/octet-stream') {
  return new NextRequest(`http://localhost/api/uploads/${id}`, {
    method: 'PUT',
    headers: { 'content-length': String(Buffer.byteLength(body)), 'content-type': contentType },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.putObject.mockResolvedValue(undefined)
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [
          {
            requestedBy: 'user-1',
            kind: 'other',
            stagingKey: 'pending/tenant/upload',
            contentType: 'application/octet-stream',
            sizeBytes: 5,
            verificationTokenHash: 'a'.repeat(64),
          },
        ],
      }),
    }),
  })
  mocks.getRequestContext.mockResolvedValue({
    userId: 'user-1',
    db: async (fn: (tx: unknown) => unknown) => fn({ select: mocks.select }),
  })
})

describe('PUT /api/uploads/[id]', () => {
  it('relays a valid owned reservation into private storage', async () => {
    const response = await PUT(request(), { params: Promise.resolve({ id }) })
    expect(response.status).toBe(204)
    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'pending/tenant/upload',
        contentType: 'application/octet-stream',
        metadata: { 'upload-token-sha256': 'a'.repeat(64) },
      }),
    )
  })

  it('requires an authenticated session', async () => {
    mocks.getRequestContext.mockResolvedValue(null)
    expect((await PUT(request(), { params: Promise.resolve({ id }) })).status).toBe(401)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  it('rejects a request whose bytes do not match its reservation', async () => {
    expect((await PUT(request('tiny'), { params: Promise.resolve({ id }) })).status).toBe(400)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })
})
