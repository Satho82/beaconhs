import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const explicit = process.env.CYCAS_TEST_DATABASE_URL
const hosted = process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true'

describe.skipIf(!explicit && !hosted)('Cycas Board disposable database acceptance', () => {
  it('proves preservation, scopes, logins, counts, replay, collisions and atomic rollback', () => {
    // GitHub's existing, pinned workflows already provision this throwaway
    // service. No deployment workflow, secret or gate configuration is changed.
    if (hosted && !explicit) {
      const app = new URL(process.env.DATABASE_URL ?? '')
      expect(app.hostname).toBe('localhost')
      expect(app.pathname).toBe('/beaconhs_test')
    }
    const output = execFileSync('pnpm', ['--filter', '@beaconhs/auth', 'test:cycas-board'], {
      cwd: fileURLToPath(new URL('../../..', import.meta.url)),
      env: {
        ...process.env,
        CYCAS_TEST_DATABASE_URL:
          explicit ?? 'postgresql://postgres:postgres@localhost:5432/beaconhs_test',
      },
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(output).toContain('14 scenarios PASS')
    expect(output).toContain('"successfulLogins":19')
    expect(output).toContain('"scopedUsers":19')
  }, 120_000)
})
