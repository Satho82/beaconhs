import { beforeEach, expect, it, vi } from 'vitest'
import { makeSignature } from 'better-auth/crypto'
import { PgDialect } from 'drizzle-orm/pg-core'
const m = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  transaction: vi.fn(),
}))
vi.mock('./server', () => ({
  getAuth: () => ({
    $context: Promise.resolve({
      authCookies: { sessionToken: { name: '__Secure-better-auth.session_token' } },
      secret: 'synthetic-test-only-not-a-live-secret',
    }),
  }),
}))
vi.mock('@beaconhs/db', () => ({ db: {}, withSuperAdmin: m.transaction }))
import { getReadOnlyPlatformOperator, verifyReadOnlyCookie } from './read-only-operator'
const secret = 'synthetic-test-only-not-a-live-secret'
const signed = async () => `synthetic-token.${await makeSignature('synthetic-token', secret)}`
const headers = async () =>
  new Headers({
    cookie: `__Secure-better-auth.session_token=${encodeURIComponent(await signed())}`,
  })
beforeEach(() => {
  vi.resetAllMocks()
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: m.where,
    limit: async () => [{ userId: 'approved' }],
  }
  m.where.mockReturnValue(chain)
  m.select.mockReturnValue(chain)
  m.transaction.mockImplementation(async (_db, fn) => fn({ execute: m.execute, select: m.select }))
})
it('verifies the existing upstream cookie signature', async () => {
  expect(await verifyReadOnlyCookie(await signed(), secret)).toBe('synthetic-token')
})
it('rejects signature tampering and missing/malformed cookies', async () => {
  expect(
    await verifyReadOnlyCookie((await signed()).replace('synthetic-token', 'other'), secret),
  ).toBeNull()
  for (const value of [undefined, '', 'unsigned', 'a.short', 'x'.repeat(4097)])
    expect(await verifyReadOnlyCookie(value, secret)).toBeNull()
})
it('uses only read-only queries, checking expiration, current role, disabled and impersonation state', async () => {
  expect(await getReadOnlyPlatformOperator(await headers())).toBe('approved')
  const dialect = new PgDialect()
  expect(m.execute.mock.calls.map(([sql]) => dialect.sqlToQuery(sql).sql)).toEqual([
    'SET TRANSACTION READ ONLY',
    "SET LOCAL statement_timeout = '5s'",
  ])
  const where = dialect.sqlToQuery(m.where.mock.calls[0]![0])
  expect(where.sql).toContain('"expiresAt" > clock_timestamp()')
  expect(where.sql).toContain('"impersonating_user_id" is null')
  expect(where.sql).toContain('"disabled_at" is null')
  expect(where.sql).toContain('"isSuperAdmin" =')
  expect(where.params).toEqual(['synthetic-token', true])
})
it('never trusts a cookie-cache-only session or a bad signature', async () => {
  expect(
    await getReadOnlyPlatformOperator(new Headers({ cookie: 'better-auth.session_data=forged' })),
  ).toBeNull()
  expect(
    await getReadOnlyPlatformOperator(
      new Headers({ cookie: '__Secure-better-auth.session_token=forged' }),
    ),
  ).toBeNull()
  expect(m.transaction).not.toHaveBeenCalled()
})
it('does not renew or delete an absent/expired session', async () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => [],
  }
  m.select.mockReturnValue(chain)
  expect(await getReadOnlyPlatformOperator(await headers())).toBeNull()
  expect(m.execute).toHaveBeenCalledTimes(2)
})
