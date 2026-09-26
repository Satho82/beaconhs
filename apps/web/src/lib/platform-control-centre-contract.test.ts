import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const webRoot = resolve(import.meta.dirname, '..')
const platformRoot = resolve(webRoot, 'app/(platform)/platform')

const preservedRoutes = [
  'page.tsx',
  'ai/page.tsx',
  'branding/page.tsx',
  'database/page.tsx',
  'email/page.tsx',
  'email-log/page.tsx',
  'email-log/[id]/page.tsx',
  'sms/page.tsx',
  'sms-log/page.tsx',
  'sms-log/[id]/page.tsx',
  'tenants/page.tsx',
  'tenants/new/page.tsx',
  'tenants/seed-templates/page.tsx',
  'tenants/[tenantId]/entitlements/page.tsx',
  'users/page.tsx',
  'users/[id]/page.tsx',
]

describe('Platform Control Centre route boundary', () => {
  it.each(preservedRoutes)('preserves /platform route for %s', (route) => {
    expect(existsSync(resolve(platformRoot, route))).toBe(true)
  })

  it('does not inherit the tenant workspace route-group layout', () => {
    expect(existsSync(resolve(webRoot, 'app/(app)/platform'))).toBe(false)
    expect(existsSync(resolve(platformRoot, 'layout.tsx'))).toBe(true)
  })

  it('authorizes with platform identity and never resolves tenant context', () => {
    const sources = [
      readFileSync(resolve(platformRoot, 'layout.tsx'), 'utf8'),
      ...preservedRoutes.map((route) => readFileSync(resolve(platformRoot, route), 'utf8')),
    ].join('\n')
    expect(sources).toContain('getPlatformOperator')
    expect(sources).not.toMatch(/getRequestContext|requireRequestContext/)
  })

  it('keeps V1.2 tenant modules in the tenant workspace', () => {
    for (const route of [
      'hospitality/maintenance/page.tsx',
      'hospitality/metering/page.tsx',
      'hospitality/handover/page.tsx',
      'corrective-actions/page.tsx',
      'hospitality/risk/page.tsx',
      'compliance/page.tsx',
    ]) {
      expect(existsSync(resolve(webRoot, 'app/(app)', route)), route).toBe(true)
    }
  })
})
