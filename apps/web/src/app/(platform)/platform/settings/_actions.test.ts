import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePlatformOperator: mocks.auth }))
vi.mock('@/lib/platform-branding-config', () => ({
  getPlatformBranding: mocks.get,
  savePlatformBranding: mocks.save,
}))
vi.mock('@/lib/platform-audit', () => ({ recordPlatformAudit: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { savePlatformIdentity } from './_actions'
const form = (name = 'Uvanoo', colour = '#123ABC') => {
  const data = new FormData()
  data.set('productName', name)
  data.set('primaryColor', colour)
  return data
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ userId: 'operator' })
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
