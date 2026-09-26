import { describe, expect, it } from 'vitest'
import { resolveAuthPublicOrigin } from './public-origin'

describe('authentication public origin', () => {
  it('prefers the explicit public origin for generated authentication links', () => {
    expect(
      resolveAuthPublicOrigin({
        PUBLIC_APP_URL: 'https://portal.uvanoo.com',
        APP_URL: 'http://web:3000',
        BETTER_AUTH_URL: 'http://0.0.0.0:3000',
        NODE_ENV: 'production',
      }),
    ).toBe('https://portal.uvanoo.com')
  })

  it('uses the documented application URL before the auth compatibility fallback', () => {
    expect(
      resolveAuthPublicOrigin({
        APP_URL: 'https://portal.uvanoo.com',
        BETTER_AUTH_URL: 'http://0.0.0.0:3000',
        NODE_ENV: 'production',
      }),
    ).toBe('https://portal.uvanoo.com')
  })

  it.each(['http://0.0.0.0:3000', 'http://[::]:3000'])(
    'rejects an internal bind address: %s',
    (BETTER_AUTH_URL) => {
      expect(() => resolveAuthPublicOrigin({ BETTER_AUTH_URL, NODE_ENV: 'production' })).toThrow(
        /not a bind address/,
      )
    },
  )

  it('rejects non-HTTPS production origins', () => {
    expect(() =>
      resolveAuthPublicOrigin({ APP_URL: 'http://portal.uvanoo.com', NODE_ENV: 'production' }),
    ).toThrow(/must use HTTPS/)
  })

  it('keeps a loopback default for local development', () => {
    expect(resolveAuthPublicOrigin({ NODE_ENV: 'development' })).toBe('http://localhost:3000')
  })
})
