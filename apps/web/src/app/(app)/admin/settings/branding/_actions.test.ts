import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  guard: vi.fn(),
  transaction: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.context }))
vi.mock('@beaconhs/tenant', () => ({ assertCan: mocks.guard }))
vi.mock('@beaconhs/db', () => ({
  db: {},
  withSuperAdmin: (_db: unknown, callback: unknown) => mocks.transaction(callback),
}))
vi.mock('@beaconhs/db/schema', () => ({ tenants: { id: 'tenant-id' } }))
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAuditInTransaction: mocks.audit }))
vi.mock('@/lib/tenant-brand-assets', () => ({
  storeTenantBrandAsset: mocks.upload,
  deleteTenantBrandAsset: mocks.remove,
  TenantBrandAssetValidationError: class extends Error {},
}))
import { saveCurrentTenantBranding } from './_actions'
const tenantId = '11111111-1111-4111-8111-111111111111'
const ctx = { tenantId, userId: 'operator' }
let where: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue(ctx)
  mocks.guard.mockImplementation(() => undefined)
  mocks.upload.mockResolvedValue(`tenants/${tenantId}/branding/logo/new.png`)
  mocks.remove.mockResolvedValue(undefined)
  mocks.audit.mockResolvedValue(undefined)
  where = vi.fn().mockResolvedValue(undefined)
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: () =>
              Promise.resolve([
                { id: tenantId, branding: { primaryColor: '#123456', pdfLetterhead: 'retained' } },
              ]),
          }),
        }),
      }),
    }),
    update: () => ({ set: mocks.update.mockReturnValue({ where }) }),
  }
  mocks.transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx))
})
describe('tenant-admin branding authorization and persistence', () => {
  it('rejects missing permission before storage or privileged reads', async () => {
    mocks.guard.mockImplementation(() => {
      throw new Error('Forbidden')
    })
    await expect(saveCurrentTenantBranding({ status: 'idle' }, new FormData())).rejects.toThrow(
      'Forbidden',
    )
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects invalid colours without writes', async () => {
    const form = new FormData()
    form.set('primaryColor', 'url(secret)')
    expect(await saveCurrentTenantBranding({ status: 'idle' }, form)).toEqual({
      status: 'error',
      outcome: 'invalid_hex',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('ignores a forged tenant id and unrelated master fields, preserving existing letterhead', async () => {
    const form = new FormData()
    form.set('tenantId', 'other-tenant')
    form.set('productName', 'Changed master')
    form.set('primaryColor', '#0f766e')
    form.set('logo', new File(['png'], 'logo.png', { type: 'image/png' }))
    expect(await saveCurrentTenantBranding({ status: 'idle' }, form)).toEqual({
      status: 'success',
      outcome: 'saved',
    })
    expect(mocks.guard).toHaveBeenCalledWith(ctx, 'admin.settings.manage')
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ tenantId, kind: 'logo' }))
    expect(where).toHaveBeenCalledWith({ column: 'tenant-id', value: tenantId })
    expect(mocks.update.mock.calls[0]?.[0].branding).toEqual({
      primaryColor: '#0F766E',
      pdfLetterhead: 'retained',
      logoUrl: `tenants/${tenantId}/branding/logo/new.png`,
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      expect.objectContaining({ entityId: tenantId }),
    )
  })
  it('returns safe errors and cleans newly uploaded objects if the audited transaction fails', async () => {
    mocks.audit.mockRejectedValue(new Error('private provider details'))
    const form = new FormData()
    form.set('logo', new File(['png'], 'logo.png', { type: 'image/png' }))
    expect(await saveCurrentTenantBranding({ status: 'idle' }, form)).toEqual({
      status: 'error',
      outcome: 'save_failed',
    })
    expect(mocks.remove).toHaveBeenCalledWith(tenantId, `tenants/${tenantId}/branding/logo/new.png`)
  })
})
