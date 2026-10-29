import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { isWopiObserver } from './wopi-observer-auth'

const token = 'a'.repeat(64)
const now = Date.parse('2026-10-29T00:00:00Z')
const env = {
  BETTER_AUTH_URL: 'https://dev.uvanoo.com',
  UVANOO_WOPI_OBSERVER_SHA256: createHash('sha256').update(token).digest('hex'),
  UVANOO_WOPI_OBSERVER_EXPIRES_AT: '2026-10-30T00:00:00Z',
}
const headers = new Headers({ authorization: `Bearer ${token}` })
it('accepts only the dedicated unexpired DEV telemetry credential', () => {
  expect(isWopiObserver(headers, env, now)).toBe(true)
})
const invalidHeaders: Record<string, string>[] = [
  {},
  { authorization: 'Bearer ' + 'b'.repeat(64) },
  { authorization: 'Basic ' + token },
  { cookie: 'better-auth.session_token=interactive-admin' },
]
it.each(invalidHeaders)('rejects invalid credentials and interactive sessions', (input) => {
  expect(isWopiObserver(new Headers(input), env, now)).toBe(false)
})
it.each([
  { BETTER_AUTH_URL: 'https://uvanoo.com' },
  { UVANOO_WOPI_OBSERVER_SHA256: '' },
  { UVANOO_WOPI_OBSERVER_SHA256: 'x'.repeat(64) },
  { UVANOO_WOPI_OBSERVER_EXPIRES_AT: 'invalid' },
  { UVANOO_WOPI_OBSERVER_EXPIRES_AT: '2026-10-29T00:00:00Z' },
])('fails closed on wrong environment, expiry or revoked credential', (override) => {
  expect(isWopiObserver(headers, { ...env, ...override }, now)).toBe(false)
})
