import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import {
  DEFAULT_TENANT_OPERATIONAL_DEFAULTS,
  parseTenantOperationalDefaults,
} from './tenant-operational-defaults'

describe('tenant operational defaults', () => {
  it('uses explicit safe defaults for tenant backfill', () => {
    expect(DEFAULT_TENANT_OPERATIONAL_DEFAULTS).toEqual({
      locale: 'en',
      timezone: 'UTC',
      dateFormat: 'medium',
      numberFormat: 'standard',
      currencyCode: 'USD',
    })
  })

  it('accepts independent locale, timezone, format, and ISO currency values', () => {
    expect(
      parseTenantOperationalDefaults({
        locale: 'en-GB',
        timezone: 'Europe/London',
        dateFormat: 'long',
        numberFormat: 'compact',
        currencyCode: 'AED',
      }),
    ).toEqual({
      locale: 'en-GB',
      timezone: 'Europe/London',
      dateFormat: 'long',
      numberFormat: 'compact',
      currencyCode: 'AED',
    })
  })

  it.each([
    [{ locale: 'not a locale' }, 'BCP 47'],
    [{ timezone: 'Not/AZone' }, 'IANA'],
    [{ currencyCode: 'Pounds' }, 'ISO 4217'],
    [{ dateFormat: 'regional' }, 'date format'],
    [{ numberFormat: 'scientific' }, 'number format'],
  ])('rejects invalid %o', (override, message) => {
    expect(() =>
      parseTenantOperationalDefaults({ ...DEFAULT_TENANT_OPERATIONAL_DEFAULTS, ...override }),
    ).toThrow(message)
  })
})
