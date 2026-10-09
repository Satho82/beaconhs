import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('@beaconhs/db', () => ({ db: {}, withSuperAdmin: mocks.transaction }))
vi.mock('@/lib/auth', () => ({ requirePlatformOperator: mocks.auth }))
vi.mock('@/lib/platform-branding-config', () => ({
  getPlatformBranding: mocks.get,
  savePlatformBranding: mocks.save,
}))
vi.mock('@/lib/platform-audit', () => ({ recordPlatformAudit: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { savePlatformIdentity, savePlatformRegionalDefaults } from './_actions'
const form = (name = 'Uvanoo', colour = '#123ABC') => {
  const data = new FormData()
  data.set('productName', name)
  data.set('primaryColor', colour)
  return data
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ userId: 'operator' })
  mocks.transaction.mockImplementation(async (_db, fn) => fn({ insert: mocks.insert }))
  mocks.insert.mockReturnValue({ values: mocks.values })
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.upsert })
  mocks.upsert.mockResolvedValue(undefined)
  mocks.get.mockResolvedValue({
    logoKey: 'existing-logo',
    analytics: { enabled: true, googleTagId: 'G-EXISTING' },
    email: { senderName: 'Existing' },
  })
})
it('preserves unrelated branding contracts and audits the supported update', async () => {
  await savePlatformIdentity(form())
  expect(mocks.save).toHaveBeenCalledWith({
    logoKey: 'existing-logo',
    analytics: { enabled: true, googleTagId: 'G-EXISTING' },
    email: { senderName: 'Existing' },
    productName: 'Uvanoo',
    primaryColor: '#123ABC',
  })
  expect(mocks.audit).toHaveBeenCalledOnce()
  expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
})
it('denies unauthorized operators before reading or writing branding', async () => {
  mocks.auth.mockRejectedValue(new Error('Forbidden'))
  await expect(savePlatformIdentity(form())).rejects.toThrow('Forbidden')
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.save).not.toHaveBeenCalled()
})
it.each([
  ['', '#123ABC'],
  ['x'.repeat(101), '#123ABC'],
  ['Uvanoo', 'red'],
])('rejects invalid identity values', async (name, colour) => {
  await expect(savePlatformIdentity(form(name, colour))).rejects.toThrow()
  expect(mocks.save).not.toHaveBeenCalled()
})
it('does not claim success when persistence fails', async () => {
  mocks.save.mockRejectedValue(new Error('Storage unavailable'))
  await expect(savePlatformIdentity(form())).rejects.toThrow('Storage unavailable')
  expect(mocks.audit).not.toHaveBeenCalled()
  expect(mocks.revalidate).not.toHaveBeenCalled()
})

const regionalForm = () => {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    locale: 'en-GB',
    timezone: 'Europe/London',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: 'standard',
    currencyCode: 'GBP',
  }))
    data.set(key, value)
  return data
}
it('persists regional defaults and their audit within the same transaction', async () => {
  await savePlatformRegionalDefaults(regionalForm())
  expect(mocks.transaction).toHaveBeenCalledOnce()
  expect(mocks.values).toHaveBeenCalledWith(
    expect.objectContaining({
      regionalDefaults: {
        locale: 'en-GB',
        timezone: 'Europe/London',
        dateFormat: 'DD/MM/YYYY',
        numberFormat: 'standard',
        currencyCode: 'GBP',
      },
    }),
  )
  expect(mocks.values).toHaveBeenCalledWith(
    expect.objectContaining({ actorUserId: 'operator', entityType: 'platform-regional-defaults' }),
  )
  expect(mocks.revalidate).toHaveBeenCalledWith('/platform/settings')
})
it('denies non-operators before any regional-default write', async () => {
  mocks.auth.mockRejectedValue(new Error('Forbidden'))
  await expect(savePlatformRegionalDefaults(regionalForm())).rejects.toThrow('Forbidden')
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it.each([
  ['locale', '!invalid'],
  ['timezone', 'Unknown/Zone'],
  ['dateFormat', 'invented'],
  ['numberFormat', 'invented'],
  ['currencyCode', 'invalid'],
])('rejects malformed regional %s before writing', async (key, value) => {
  const data = regionalForm()
  data.set(key, value)
  await expect(savePlatformRegionalDefaults(data)).rejects.toThrow()
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('propagates regional persistence failure without success or cache invalidation', async () => {
  mocks.upsert.mockRejectedValue(new Error('write failed'))
  await expect(savePlatformRegionalDefaults(regionalForm())).rejects.toThrow('write failed')
  expect(mocks.values).toHaveBeenCalledTimes(1)
  expect(mocks.revalidate).not.toHaveBeenCalled()
})
