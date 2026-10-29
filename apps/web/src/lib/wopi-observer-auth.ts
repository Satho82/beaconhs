import { createHash, timingSafeEqual } from 'node:crypto'

// Dedicated DEV telemetry identity. Never grants a user session or document access.
export function isWopiObserver(
  headers: Headers,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
): boolean {
  if (env.BETTER_AUTH_URL !== 'https://dev.uvanoo.com') return false
  const expected = env.UVANOO_WOPI_OBSERVER_SHA256 ?? ''
  const expires = Date.parse(env.UVANOO_WOPI_OBSERVER_EXPIRES_AT ?? '')
  const value = headers.get('authorization') ?? ''
  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    !Number.isFinite(expires) ||
    expires <= now ||
    !/^Bearer [A-Za-z0-9_-]{64}$/.test(value)
  )
    return false
  const actual = createHash('sha256').update(value.slice(7)).digest()
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}
