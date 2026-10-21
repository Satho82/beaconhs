import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rows: [] as { email: unknown; branding?: unknown }[],
  select: vi.fn(),
  withSuperAdmin: vi.fn(),
  resolveEffectiveTransport: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))
vi.mock('@beaconhs/db/schema', () => ({
  platformSettings: { id: 'id', email: 'email', branding: 'branding' },
  PLATFORM_SETTINGS_ID: 'platform',
  tenants: { id: 'id', settings: 'settings' },
}))
vi.mock('@beaconhs/db', () => ({ db: {}, withSuperAdmin: mocks.withSuperAdmin }))
vi.mock('@beaconhs/emails', () => ({
  resolveEffectiveTransport: mocks.resolveEffectiveTransport,
}))

const tx = {
  select: mocks.select,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.length = 0
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          const row = mocks.rows.shift()
          return row ? [row] : []
        },
      }),
    }),
  }))
  mocks.withSuperAdmin.mockImplementation(async (_db, callback) => callback(tx))
  mocks.resolveEffectiveTransport.mockImplementation(
    (platform: { mode?: string; provider?: string; fromEmail?: string } | null) => {
      if (platform?.mode === 'disabled') return { kind: 'suppressed' }
      if (platform?.provider === 'sendgrid' && platform.fromEmail) {
        return {
          kind: 'transport',
          source: 'platform',
          transport: { provider: 'sendgrid', apiKey: 'test', from: platform.fromEmail },
        }
      }
      return { kind: 'unconfigured' }
    },
  )
})

import { requireEmailTransport, resolveEmailDelivery } from './resolve-email-transport'

describe('requireEmailTransport', () => {
  it('returns a database-resolved transport', () => {
    const transport = {
      provider: 'sendgrid' as const,
      apiKey: 'SG.test',
      from: 'BeaconHS <beacon@example.test>',
    }
    expect(requireEmailTransport({ kind: 'transport', transport, source: 'platform' })).toBe(
      transport,
    )
  })

  it('fails explicitly when no provider is configured', () => {
    expect(() => requireEmailTransport({ kind: 'unconfigured' })).toThrow(
      'configure an enabled platform or tenant provider',
    )
  })

  it('does not turn the platform kill switch into a provider fallback', () => {
    expect(() => requireEmailTransport({ kind: 'suppressed' })).toThrow(
      'disabled by the platform administrator',
    )
  })

  it('uses the platform product name as the sender name for every delivery', async () => {
    mocks.rows.push({
      email: {
        provider: 'sendgrid',
        enabled: true,
        fromName: 'Legacy name',
        fromEmail: 'alerts@example.test',
      },
      branding: { productName: 'Uvanoo' },
    })

    await expect(resolveEmailDelivery(null)).resolves.toMatchObject({
      kind: 'transport',
      transport: { from: 'Uvanoo <alerts@example.test>' },
    })
  })

  it('reads the platform policy for every job so a kill-switch change is immediate', async () => {
    mocks.rows.push({ email: { mode: 'disabled' } }, { email: null })

    await expect(resolveEmailDelivery(null)).resolves.toEqual({ kind: 'suppressed' })
    await expect(resolveEmailDelivery(null)).resolves.toEqual({ kind: 'unconfigured' })
    expect(mocks.select).toHaveBeenCalledTimes(2)
    expect(mocks.withSuperAdmin).toHaveBeenCalledTimes(2)
  })
})
