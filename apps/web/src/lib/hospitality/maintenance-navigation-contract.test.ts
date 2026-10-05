import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const registry = readFileSync(new URL('../nav/registry.ts', import.meta.url), 'utf8')
const guestService = readFileSync(new URL('./guest-maintenance.ts', import.meta.url), 'utf8')
const maintenanceService = readFileSync(new URL('./maintenance.ts', import.meta.url), 'utf8')
const queuePage = readFileSync(
  new URL('../../app/(app)/hospitality/maintenance/page.tsx', import.meta.url),
  'utf8',
)

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

  it('denies direct queue access without both the module entitlement and read permission', () => {
    expect(queuePage).toContain("assertTenantModuleEntitled(ctx, 'hospitality.maintenance')")
    expect(queuePage).toContain("assertCan(ctx, 'maintenance.read')")
  })

  it('keeps maintenance reads and writes inside the caller property scope', () => {
    expect(queuePage).toContain('hospitalityPropertyWhere(ctx, hospitalityProperties.id)')
    expect(maintenanceService).toContain('assertCanAccessProperty(ctx, room.propertyId)')
    expect(maintenanceService).toContain('assertCanAccessProperty(ctx, current.propertyId)')
    expect(maintenanceService).toContain('assertCanAccessProperty(ctx, issue.propertyId)')
  })
})
