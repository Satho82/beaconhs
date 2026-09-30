import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  users: 0,
  signUp: vi.fn(),
  auth: vi.fn(),
  audit: vi.fn(),
  statements: vi.fn(),
  close: vi.fn(),
  adapter: vi.fn(),
}))
vi.mock('better-auth', () => ({ betterAuth: mocks.auth }))
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: mocks.adapter }))
vi.mock('@beaconhs/db', () => ({
  extractRows: (value: unknown) => value,
  createClient: () => ({
    sql: { end: mocks.close },
    db: {
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          execute: mocks.statements,
          select: () => ({ from: async () => [{ total: mocks.users }] }),
          insert: () => ({ values: mocks.audit }),
        }),
    },
  }),
}))

import {
  provisionFirstIdentity,
  requireEmptyIdentityDatabase,
  requireFirstIdentityTarget,
} from './dev-first-identity'

const evidence = {
  host: 'vps-c54e0b88',
  container: 'uvanoo-dev-postgres',
  network: 'uvanoo-dev-private',
  containerId: 'a'.repeat(64),
  networkId: 'b'.repeat(64),
  address: '172.30.0.2',
}
const environment = {
  NODE_ENV: 'development',
  UVANOO_ENVIRONMENT: 'development',
  UVANOO_FIRST_IDENTITY_CONFIRM: 'CREATE_FIRST_DEV_IDENTITY',
  UVANOO_FIRST_IDENTITY_EMAIL: 'dev.admin@uvanoo.invalid',
  UVANOO_FIRST_IDENTITY_PASSWORD: 'test-only-not-a-real-secret-0123456789',
  BETTER_AUTH_SECRET: 'test-only-auth-secret-not-for-deployment',
  DATABASE_URL: 'postgresql://beaconhs_app:test@uvanoo-dev-postgres/beaconhs',
  SUPERADMIN_DATABASE_URL: 'postgresql://beaconhs_super:test@uvanoo-dev-postgres/beaconhs',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.users = 0
  mocks.statements.mockResolvedValue([
    { database: 'beaconhs', role: 'beaconhs_super', address: evidence.address, superuser: false },
  ])
  mocks.auth.mockReturnValue({ api: { signUpEmail: mocks.signUp } })
  mocks.signUp.mockImplementation(async () => {
    mocks.users += 1
    return { user: { id: 'first-user', email: environment.UVANOO_FIRST_IDENTITY_EMAIL } }
  })
})

describe('guarded DEV first identity', () => {
  it.each(['production', 'staging', '', undefined])('rejects environment %s', (value) => {
    expect(() =>
      requireFirstIdentityTarget({ ...environment, UVANOO_ENVIRONMENT: value }, evidence),
    ).toThrow()
  })
  it.each(['production', 'staging'])('rejects conflicting runtime %s', (value) => {
    expect(() =>
      requireFirstIdentityTarget({ ...environment, NODE_ENV: value }, evidence),
    ).toThrow()
    expect(() => requireFirstIdentityTarget({ ...environment, APP_ENV: value }, evidence)).toThrow()
  })
  it.each(['', 'yes', undefined])('rejects wrong confirmation %s', (value) => {
    expect(() =>
      requireFirstIdentityTarget(
        { ...environment, UVANOO_FIRST_IDENTITY_CONFIRM: value },
        evidence,
      ),
    ).toThrow()
  })
  it.each([
    'postgresql://beaconhs_super:test@staging/beaconhs',
    'postgresql://beaconhs_super:test@production/beaconhs',
    'postgresql://beaconhs_super:test@uvanoo-dev-postgres/wrong',
    'postgresql://postgres:test@uvanoo-dev-postgres/beaconhs',
    'postgresql://beaconhs_super:test@uvanoo-dev-postgres/beaconhs?host=production',
  ])('rejects wrong database %s', (url) => {
    expect(() =>
      requireFirstIdentityTarget({ ...environment, SUPERADMIN_DATABASE_URL: url }, evidence),
    ).toThrow()
  })
  it('rejects missing or mismatched Docker evidence and non-DEV email', () => {
    for (const mismatch of [
      { network: 'staging' },
      { container: 'production' },
      { host: 'unknown' },
      { networkId: '' },
    ])
      expect(() => requireFirstIdentityTarget(environment, { ...evidence, ...mismatch })).toThrow()
    expect(() =>
      requireFirstIdentityTarget(
        { ...environment, UVANOO_FIRST_IDENTITY_EMAIL: 'admin@example.com' },
        evidence,
      ),
    ).toThrow()
  })
  it('accepts only an empty verified DEV target', () => {
    expect(requireFirstIdentityTarget(environment, evidence).email).toBe('dev.admin@uvanoo.invalid')
    expect(() => requireEmptyIdentityDatabase(0)).not.toThrow()
    for (const count of [1, 2, -1, NaN]) expect(() => requireEmptyIdentityDatabase(count)).toThrow()
  })
  it('uses the supported server API, disables auto-session creation, audits and refuses a second run', async () => {
    const log = vi.spyOn(console, 'log')
    await expect(provisionFirstIdentity(environment, evidence)).resolves.toEqual({
      id: 'first-user',
      email: environment.UVANOO_FIRST_IDENTITY_EMAIL,
    })
    expect(mocks.adapter).toHaveBeenCalledOnce()
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: { disabled: true },
        emailAndPassword: { enabled: true, autoSignIn: false, minPasswordLength: 24 },
      }),
    )
    expect(mocks.signUp).toHaveBeenCalledWith({
      body: {
        email: environment.UVANOO_FIRST_IDENTITY_EMAIL,
        password: environment.UVANOO_FIRST_IDENTITY_PASSWORD,
        name: 'Uvanoo Development Administrator',
      },
    })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'development_first_identity',
        actorUserId: 'first-user',
      }),
    )
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(
      environment.UVANOO_FIRST_IDENTITY_PASSWORD,
    )
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
    await expect(provisionFirstIdentity(environment, evidence)).rejects.toThrow('already exist')
    expect(mocks.signUp).toHaveBeenCalledOnce()
    expect(mocks.close).toHaveBeenCalledTimes(2)
  })
  it('rejects a connected-server mismatch before account creation', async () => {
    mocks.statements.mockResolvedValue([
      { database: 'beaconhs', role: 'beaconhs_super', address: '172.31.0.2', superuser: false },
    ])
    await expect(provisionFirstIdentity(environment, evidence)).rejects.toThrow('Connected server')
    expect(mocks.signUp).not.toHaveBeenCalled()
  })
  it('keeps public signup disabled with no public bootstrap route or credential fabrication', () => {
    const runtime = readFileSync(
      new URL('../../../packages/auth/src/server.ts', import.meta.url),
      'utf8',
    )
    expect(runtime.match(/disableSignUp: true/g)).toHaveLength(2)
    const source = readFileSync(new URL('./dev-first-identity.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(
      /\.insert\((?:users|account|sessions)\)|password\.hash|createServer|\.handler/,
    )
    const app = fileURLToPath(new URL('../src/app/', import.meta.url))
    const files = readdirSync(app, { recursive: true }).map(String)
    expect(files.some((file) => /bootstrap|setup-admin|first-identity/.test(file))).toBe(false)
    for (const file of files.filter((file) => /\.(ts|tsx)$/.test(file))) {
      const content = readFileSync(`${app}/${file}`, 'utf8')
      expect(content).not.toContain('dev-first-identity')
    }
  })
})
