import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  context: vi.fn(),
  can: vi.fn(),
  form: vi.fn(),
  platformEmail: vi.fn(),
  tenantEmail: vi.fn(),
  platformSms: vi.fn(),
  tenantSms: vi.fn(),
}))
vi.mock('@/i18n/generated.server', () => ({
  getGeneratedTranslations: async () => (value: string) => value,
  getGeneratedValueTranslations: async () => (value: string) => value,
}))
vi.mock('@/lib/auth', () => ({ requireRequestContext: mocks.context }))
vi.mock('@beaconhs/tenant', () => ({ can: mocks.can }))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('REDIRECT')
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('@/lib/email-config', () => ({
  getPlatformEmailRaw: mocks.platformEmail,
  getTenantEmailRaw: mocks.tenantEmail,
}))
vi.mock('@/lib/sms-config', () => ({
  getPlatformSmsRaw: mocks.platformSms,
  getTenantSmsRaw: mocks.tenantSms,
}))
vi.mock('@beaconhs/emails', () => ({ resolveEffectiveTransport: () => ({ kind: 'transport' }) }))
vi.mock('@beaconhs/sms', () => ({ resolveEffectiveSmsTransport: () => ({ kind: 'unconfigured' }) }))
vi.mock('@beaconhs/ui', () => ({ DetailHeader: () => null }))
vi.mock('@/components/page-layout', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/notifications-sub-nav', () => ({ NotificationsSubNav: () => null }))
vi.mock('../settings/settings-form', () => ({
  SettingsNavigation: () => <nav>Tenant settings</nav>,
}))
vi.mock('@/components/admin-load-failure', () => ({
  AdminLoadFailure: () => <div role="alert">Retry</div>,
}))
vi.mock('./_form', () => ({
  NotificationSettingsForm: (props: unknown) => {
    mocks.form(props)
    return <form />
  },
}))

import Page from './page'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.can.mockReturnValue(true)
  mocks.context.mockResolvedValue({ tenantId: 'current-tenant', isSuperAdmin: false, db: mocks.db })
  mocks.db
    .mockResolvedValueOnce([{ name: 'Current Hotel' }])
    .mockResolvedValueOnce({ roleRows: [], memberRows: [] })
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
})

describe('notification configuration load boundary', () => {
  it('allows defaults only after successful empty queries', async () => {
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Current Hotel')
    expect(mocks.form).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: {},
        policy: expect.objectContaining({ digestMode: 'off' }),
      }),
    )
    expect(html).not.toContain('role="alert"')
  })
  it.each([1, 2, 3, 4])('withholds editing after configuration query %s fails', async (failure) => {
    const responses = [[{ name: 'Current Hotel' }], { roleRows: [], memberRows: [] }, [], [], []]
    mocks.db.mockReset()
    responses.forEach((value, index) => {
      if (index === failure)
        mocks.db.mockRejectedValueOnce(new Error('postgres password private-stack'))
      else mocks.db.mockResolvedValueOnce(value)
    })
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Current Hotel')
    expect(html).toContain('role="alert"')
    expect(html).not.toMatch(/postgres|password|private-stack/)
    expect(mocks.form).not.toHaveBeenCalled()
  })
  it.each(['platformEmail', 'tenantEmail', 'platformSms', 'tenantSms'] as const)(
    'does not misreport failed %s as unconfigured',
    async (source) => {
      mocks[source].mockRejectedValue(new Error('private transport configuration'))
      const html = renderToStaticMarkup(await Page())
      expect(html).toContain('role="alert"')
      expect(html).not.toContain('private transport')
      expect(mocks.form).not.toHaveBeenCalled()
    },
  )
  it('keeps authentication failures outside the configuration catch', async () => {
    mocks.context.mockRejectedValue(new Error('AUTH'))
    await expect(Page()).rejects.toThrow('AUTH')
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it('denies unauthorized users before reading tenant data', async () => {
    mocks.can.mockReturnValue(false)
    await expect(Page()).rejects.toThrow('REDIRECT')
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it('does not hide a missing tenant', async () => {
    mocks.db.mockReset().mockResolvedValueOnce([])
    await expect(Page()).rejects.toThrow('NOT_FOUND')
    expect(mocks.form).not.toHaveBeenCalled()
  })
})
