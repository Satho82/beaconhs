import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  guard: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.context }))
vi.mock('@beaconhs/tenant', () => ({
  assertCan: mocks.guard,
  resolveRegulatoryTerminology: (value: { regulatoryTerminology?: unknown }) =>
    value.regulatoryTerminology ?? {},
}))
vi.mock('@beaconhs/db/schema', () => ({ tenants: { id: 'tenant-id' } }))
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))
vi.mock('@beaconhs/db', () => ({
  db: {},
  withSuperAdmin: (_db: unknown, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({ where: (filter: unknown) => ({ limit: () => mocks.select(filter) }) }),
      }),
      update: () => ({
        set: (value: unknown) => ({ where: (filter: unknown) => mocks.update(value, filter) }),
      }),
    }),
}))
vi.mock('@/lib/audit', () => ({ recordAuditInTransaction: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { saveAdvancedSettings } from './_actions'
const data = () => {
  const form = new FormData()
  form.set('authorityName', 'Authority')
  form.set('tenantId', 'forged')
  return form
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.context.mockResolvedValue({ tenantId: 'authenticated-tenant' })
  mocks.select.mockResolvedValue([
    { settings: { retainedPreference: true, regulatoryTerminology: { authorityName: 'Before' } } },
  ])
})
it('checks settings permission before reading or mutating', async () => {
  mocks.guard.mockImplementation(() => {
    throw new Error('Forbidden')
  })
  await expect(saveAdvancedSettings(data())).rejects.toThrow('Forbidden')
  expect(mocks.select).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})
it('uses the authenticated tenant, preserves unrelated settings and audits within the transaction', async () => {
  await saveAdvancedSettings(data())
  expect(mocks.select).toHaveBeenCalledWith({ column: 'tenant-id', value: 'authenticated-tenant' })
  expect(mocks.update).toHaveBeenCalledWith(
    {
      settings: expect.objectContaining({
        retainedPreference: true,
        regulatoryTerminology: expect.objectContaining({ authorityName: 'Authority' }),
      }),
    },
    { column: 'tenant-id', value: 'authenticated-tenant' },
  )
  expect(mocks.audit).toHaveBeenCalledOnce()
  expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
})
it('rejects oversized input before persistence', async () => {
  const form = data()
  form.set('authorityName', 'x'.repeat(2001))
  await expect(saveAdvancedSettings(form)).rejects.toThrow('too long')
  expect(mocks.update).not.toHaveBeenCalled()
})
it('does not report success for a missing tenant', async () => {
  mocks.select.mockResolvedValue([])
  await expect(saveAdvancedSettings(data())).rejects.toThrow('Tenant not found')
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.audit).not.toHaveBeenCalled()
})
