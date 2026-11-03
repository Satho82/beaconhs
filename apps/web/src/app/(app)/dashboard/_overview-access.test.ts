import { describe, expect, it } from 'vitest'
import type { ModuleKey } from '@/lib/module-entitlements/catalogue'
import { overviewAccess } from './_overview-access'

const modules = new Set<ModuleKey>([
  'hospitality.maintenance',
  'core.metering',
  'core.action-plans',
  'core.training',
])
const context = (permissions: string[], isSuperAdmin = false) => ({
  permissions: new Set(permissions),
  isSuperAdmin,
})

describe('dashboard overview access', () => {
  it('does not expose module totals to self-only or analytics-only users', () => {
    expect(
      overviewAccess(context(['ca.read.self', 'training.read.self', 'reports.read']), modules),
    ).toEqual({
      maintenance: false,
      metering: false,
      actions: false,
      training: false,
    })
  })
  it('requires both the appropriate permission and enabled module', () => {
    const manager = context([
      'maintenance.read',
      'hospitality.read',
      'ca.read.site',
      'training.read.all',
    ])
    expect(overviewAccess(manager, modules)).toEqual({
      maintenance: true,
      metering: true,
      actions: true,
      training: true,
    })
    expect(overviewAccess(manager, new Set())).toEqual({
      maintenance: false,
      metering: false,
      actions: false,
      training: false,
    })
    expect(overviewAccess(context([], true), new Set())).toEqual({
      maintenance: false,
      metering: false,
      actions: false,
      training: false,
    })
  })
})
