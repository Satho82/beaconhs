import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bootstrapRequestAllowed } from './dev-telemetry-bootstrap'
const now = Date.parse('2026-10-29T16:00:00Z')
const env = {
  UVANOO_DEV_TELEMETRY_BOOTSTRAP: 'true',
  UVANOO_DEV_TELEMETRY_BOOTSTRAP_EXPIRES_AT: new Date(now + 3600_000).toISOString(),
  BETTER_AUTH_URL: 'https://dev.uvanoo.com',
  UVANOO_RECOVERY_COMPOSE_ID: 'wYb0LxLQrvj2FPI21i-Oj',
  UVANOO_RECOVERY_SOURCE_SHA: 'a'.repeat(40),
  APP_VERSION: 'a'.repeat(40),
  UVANOO_WOPI_RECOVERY_EPOCH: 'b'.repeat(64),
  UVANOO_WOPI_OBSERVER_SHA256: 'c'.repeat(64),
}
describe('DEV telemetry bootstrap request fence', () => {
  it('does not change deployments without the explicit bootstrap switch', () => {
    expect(bootstrapRequestAllowed('POST', '/anything', {}, now)).toBe(true)
  })
  it.each(['/api/health/ready', '/api/internal/recovery/wopi'])('permits GET %s only', (path) => {
    expect(existsSync(new URL('../app' + path + '/route.ts', import.meta.url))).toBe(true)
    expect(bootstrapRequestAllowed('GET', path, env, now)).toBe(true)
    expect(bootstrapRequestAllowed('POST', path, env, now)).toBe(false)
  })
  it.each([
    '/',
    '/login',
    '/api/health',
    '/api/health/ready/extra',
    '/api/auth/sign-in/email',
    '/api/trpc/handover.create',
    '/browser/editor',
    '/wopi/files/abc',
    '/api/internal/recovery/wopi/extra',
  ])('blocks application route %s', (path) => {
    expect(bootstrapRequestAllowed('GET', path, env, now)).toBe(false)
    expect(bootstrapRequestAllowed('POST', path, env, now)).toBe(false)
  })
  it('retains only the existing capability-authenticated save callback', () => {
    const path = '/wopi/files/11111111-1111-1111-1111-111111111111/contents'
    expect(bootstrapRequestAllowed('POST', path, env, now)).toBe(true)
    expect(bootstrapRequestAllowed('GET', path, env, now)).toBe(false)
  })
  it.each([
    { BETTER_AUTH_URL: 'https://production.invalid' },
    { UVANOO_DEV_TELEMETRY_BOOTSTRAP: 'false' },
    { UVANOO_RECOVERY_COMPOSE_ID: '' },
    { APP_VERSION: 'd'.repeat(40) },
    { UVANOO_WOPI_RECOVERY_EPOCH: '' },
    { UVANOO_WOPI_OBSERVER_SHA256: '' },
    { UVANOO_DEV_TELEMETRY_BOOTSTRAP_EXPIRES_AT: new Date(now).toISOString() },
    { UVANOO_DEV_TELEMETRY_BOOTSTRAP_EXPIRES_AT: new Date(now + 7200_001).toISOString() },
  ])('fails closed for invalid or expired bootstrap configuration %j', (change) => {
    expect(bootstrapRequestAllowed('GET', '/api/health/ready', { ...env, ...change }, now)).toBe(
      false,
    )
  })
})
