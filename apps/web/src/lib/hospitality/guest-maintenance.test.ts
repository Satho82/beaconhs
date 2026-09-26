import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@beaconhs/db', () => ({
  db: {},
  withSuperAdmin: vi.fn(),
  withTenant: vi.fn(),
}))
vi.mock('@beaconhs/jobs/rate-limit', () => ({ consumeRateLimit: vi.fn() }))

import {
  createRoomQrToken,
  isRoomQrToken,
  parseGuestMaintenanceInput,
  submitGuestMaintenanceIssue,
} from './guest-maintenance'
import { withSuperAdmin } from '@beaconhs/db'
import { consumeRateLimit } from '@beaconhs/jobs/rate-limit'

const valid = {
  token: createRoomQrToken(),
  submissionId: '00000000-0000-4000-8000-000000000001',
  category: 'Water or bathroom',
  description: 'The shower is not draining.',
  priority: 'high',
  guestName: 'Guest',
  guestContact: '',
  contactConsent: false,
  website: '',
}

describe('guest room maintenance input', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates unique 256-bit URL-safe room tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, createRoomQrToken))
    expect(tokens.size).toBe(50)
    for (const token of tokens) {
      expect(token).toHaveLength(43)
      expect(isRoomQrToken(token)).toBe(true)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('accepts a bounded valid guest report', () => {
    expect(parseGuestMaintenanceInput(valid)).toMatchObject({
      category: 'Water or bathroom',
      priority: 'high',
      contactConsent: false,
    })
  })

  it('requires consent when contact details are supplied', () => {
    expect(() =>
      parseGuestMaintenanceInput({ ...valid, guestContact: 'guest@example.com' }),
    ).toThrow(/Consent/)
  })

  it('silently accepts honeypot submissions without touching infrastructure', async () => {
    await expect(
      submitGuestMaintenanceIssue({ ...valid, website: 'spam' }, 'fingerprint'),
    ).resolves.toEqual({ ok: true, reference: 'received' })
    expect(consumeRateLimit).not.toHaveBeenCalled()
    expect(withSuperAdmin).not.toHaveBeenCalled()
  })

  it('fails closed before database resolution when rate limiting is unavailable', async () => {
    vi.mocked(consumeRateLimit).mockRejectedValueOnce(new Error('offline'))
    await expect(submitGuestMaintenanceIssue(valid, 'fingerprint')).rejects.toThrow(
      /temporarily unavailable/,
    )
    expect(withSuperAdmin).not.toHaveBeenCalled()
  })

  it('blocks an exhausted public submission window before database resolution', async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({
      allowed: false,
      count: 6,
      remaining: 0,
      resetAt: new Date(),
    })
    await expect(submitGuestMaintenanceIssue(valid, 'fingerprint')).rejects.toThrow(/Too many/)
    expect(withSuperAdmin).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...valid, token: 'room-101' }, 'invalid'],
    [{ ...valid, submissionId: 'not-a-uuid' }, 'refresh'],
    [{ ...valid, submissionId: '10000000-0000-1000-8000-000000000001' }, 'refresh'],
    [{ ...valid, submissionId: '10000000-0000-4000-7000-000000000001' }, 'refresh'],
    [{ ...valid, description: 'no' }, 'detail'],
    [{ ...valid, priority: 'critical' }, 'urgency'],
  ])('rejects invalid public input', (input, message) => {
    expect(() => parseGuestMaintenanceInput(input)).toThrow(message)
  })
})
