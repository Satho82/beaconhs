import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const registry = readFileSync(new URL('../nav/registry.ts', import.meta.url), 'utf8')
const guestService = readFileSync(new URL('./guest-maintenance.ts', import.meta.url), 'utf8')

describe('hospitality maintenance visibility', () => {
  it('exposes the existing queue to authorised operational users', () => {
    expect(registry).toContain("key: 'hospitality-maintenance'")
    expect(registry).toContain("href: '/hospitality/maintenance'")
    expect(registry).toContain("requiredPermission: 'maintenance.read'")
  })

  it('keeps guest QR reports in the shared maintenance issue engine', () => {
    expect(guestService).toContain('.insert(maintenanceIssues)')
    expect(guestService).toContain("source: 'guest_qr'")
    expect(guestService).toContain('roomId: target.roomId')
  })
})
