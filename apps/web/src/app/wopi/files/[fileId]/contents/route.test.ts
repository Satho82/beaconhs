import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({
  begin: vi.fn(),
  commit: vi.fn(),
  fail: vi.fn(),
  settle: vi.fn(),
  body: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
  verify: vi.fn(),
  principal: vi.fn(),
  active: vi.fn(),
  access: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  tenant: vi.fn(),
}))
vi.mock('@beaconhs/db', () => ({ db: {}, withTenant: m.tenant }))
vi.mock('@beaconhs/db/schema', () => ({
  attachments: {},
  documents: {},
  trainingContentItems: {},
  trainingLessons: {},
}))
vi.mock('@beaconhs/storage', () => ({
  deleteObject: m.remove,
  getObjectStream: vi.fn(),
  newAttachmentKey: () => 'synthetic-staged',
  putObject: m.put,
}))
vi.mock('@beaconhs/audit', () => ({ audit: m.audit }))
vi.mock('@/lib/wopi', () => ({ verifyWopiToken: m.verify }))
vi.mock('@/lib/wopi-access', () => ({
  wopiGrantCanAccessFile: m.access,
  wopiPrincipalIsAuthorized: m.principal,
}))
vi.mock('@/lib/active-tenant', () => ({ tenantIsActive: m.active }))
vi.mock('@/lib/wopi-save-telemetry', () => ({
  beginSave: m.begin,
  commitSave: m.commit,
  failSave: m.fail,
  settleSave: m.settle,
}))
vi.mock('@/lib/request-body', () => ({
  readBoundedRequestBody: m.body,
  RequestBodyLengthError: class extends Error {},
  RequestBodyTimeoutError: class extends Error {},
  RequestBodyTooLargeError: class extends Error {},
}))
import { POST } from './route'
const fileId = '00000000-0000-4000-8000-000000000001'
const attempt = { id: 'attempt' }
const tx = { select: m.select, update: m.update }
beforeEach(() => {
  vi.resetAllMocks()
  m.verify.mockReturnValue({
    tenantId: 'tenant',
    userId: 'user',
    canWrite: true,
    target: 'document',
  })
  m.begin.mockResolvedValue(attempt)
  m.active.mockResolvedValue(true)
  m.principal.mockResolvedValue(true)
  m.access.mockResolvedValue(true)
  m.body.mockResolvedValue(Buffer.from('synthetic office bytes'))
  const chain = {
    from: () => chain,
    where: () => chain,
    set: () => chain,
    limit: async () => [
      {
        key: 'old',
        filename: 'fixture.docx',
        updatedAt: new Date(0),
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ],
    returning: async () => [{ id: fileId }],
  }
  m.select.mockReturnValue(chain)
  m.update.mockReturnValue(chain)
  m.tenant.mockImplementation(async (_db, _tenant, fn) => fn(tx))
})
const request = () =>
  POST(
    new NextRequest(`https://dev.uvanoo.com/wopi/files/${fileId}/contents`, { method: 'POST' }),
    { params: Promise.resolve({ fileId }) },
  )
it('denies before telemetry/body/storage when token is invalid', async () => {
  m.verify.mockReturnValue(null)
  expect((await request()).status).toBe(401)
  expect(m.begin).not.toHaveBeenCalled()
  expect(m.body).not.toHaveBeenCalled()
})
it('fails closed before any body or object write if begin persistence fails', async () => {
  m.begin.mockRejectedValue(new Error('database unavailable'))
  expect((await request()).status).toBe(503)
  expect(m.body).not.toHaveBeenCalled()
  expect(m.put).not.toHaveBeenCalled()
})
it('records failed body validation', async () => {
  m.body.mockResolvedValue(Buffer.alloc(0))
  expect((await request()).status).toBe(400)
  expect(m.fail).toHaveBeenCalledWith(attempt)
  expect(m.commit).not.toHaveBeenCalled()
})
it('records ambiguous storage errors as failed rather than drained', async () => {
  m.put.mockRejectedValue(new Error('storage lost acknowledgement'))
  expect((await request()).status).toBe(503)
  expect(m.fail).toHaveBeenCalledWith(attempt)
})
it('places terminal success on the same transaction as attachment updates and audit', async () => {
  expect((await request()).status).toBe(200)
  expect(m.commit).toHaveBeenCalledWith(tx, attempt)
  expect(m.audit.mock.invocationCallOrder[0]).toBeLessThan(m.commit.mock.invocationCallOrder[0]!)
  expect(m.begin.mock.invocationCallOrder[0]).toBeLessThan(m.body.mock.invocationCallOrder[0]!)
  expect(m.fail).not.toHaveBeenCalled()
})
it('does not confirm success if terminal persistence fails', async () => {
  m.commit.mockRejectedValue(new Error('transaction rollback'))
  expect((await request()).status).toBe(503)
  expect(m.fail).toHaveBeenCalledWith(attempt)
})
it('never converts an unavailable failure ledger into a successful response', async () => {
  m.body.mockRejectedValue(new Error('stream interrupted'))
  m.fail.mockRejectedValue(new Error('ledger unavailable'))
  expect((await request()).status).toBe(503)
})
it('preserves unconfigured deployment error behavior without telemetry writes', async () => {
  m.begin.mockResolvedValue(null)
  m.put.mockRejectedValue(new Error('original storage error'))
  await expect(request()).rejects.toThrow('original storage error')
  expect(m.fail).not.toHaveBeenCalled()
})
it('preserves confirmed editor success while unresolved cleanup blocks recovery', async () => {
  m.settle.mockRejectedValue(new Error('cleanup ledger unavailable'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect((await request()).status).toBe(200)
    expect(m.commit).toHaveBeenCalledWith(tx, attempt)
    expect(m.fail).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
