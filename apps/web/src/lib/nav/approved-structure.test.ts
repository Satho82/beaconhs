import { buildDefaultNavConfig } from './registry'
import { describe, expect, it } from 'vitest'
import { approvedNavigation, APPROVED_APPLICATION_GROUPS } from './approved-structure'
import type { SidebarNavGroup } from '@/components/sidebar-nav'
import { findActiveNavHref } from '@/components/sidebar-nav-active'
import type { ModuleKey } from '@/lib/module-entitlements/catalogue'
const item = (href: string) => ({ href, label: href, iconKey: 'grid' })
const source = (href: string): SidebarNavGroup[] => [{ label: 'Existing', items: [item(href)] }]
const flatten = (groups: SidebarNavGroup[]) =>
  groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]))
describe('approved navigation boundaries', () => {
  it('retains all 17 groups plus Approvals in the documented order', () => {
    expect(APPROVED_APPLICATION_GROUPS).toHaveLength(18)
    expect(APPROVED_APPLICATION_GROUPS).toContain('Approvals')
    expect(APPROVED_APPLICATION_GROUPS).toContain('Reporting')
    expect(APPROVED_APPLICATION_GROUPS).toContain('Reports')
  })
  it('never restores a hidden module or creates unimplemented groups', () => {
    const result = flatten(approvedNavigation([], () => true, new Set()))
    expect(result).toEqual([])
  })
  it('checks permissions AND entitlements for every maintenance child', () => {
    const groups = source('/hospitality/maintenance')
    const allowed = new Set<ModuleKey>(['hospitality.maintenance'])
    expect(
      flatten(approvedNavigation(groups, () => false, allowed)).some(
        (i) => i.label === 'Report Issue',
      ),
    ).toBe(false)
    expect(
      flatten(approvedNavigation(groups, () => true, new Set())).some(
        (i) => i.label === 'Report Issue',
      ),
    ).toBe(false)
    expect(
      flatten(approvedNavigation(groups, () => true, allowed)).some(
        (i) => i.label === 'Report Issue',
      ),
    ).toBe(true)
  })
  it('distinguishes module access from menu preferences and checks child permissions', () => {
    const groups = source('/admin/settings')
    const result = flatten(
      approvedNavigation(groups, (p) => p === 'admin.settings.manage', new Set()),
    )
    expect(result.find((i) => i.label === 'Modules')?.href).toBe('/admin/settings/modules')
    expect(result.find((i) => i.label === 'Integrations')).toBeUndefined()
    expect(result.find((i) => i.label === 'Advanced')?.href).toBe('/admin/settings/advanced')
  })
  it('uses only the resolved property and requires both sign-off entitlements', () => {
    const groups = source('/hospitality/properties')
    const allowed = new Set<ModuleKey>(['hospitality.properties', 'hospitality.diary'])
    expect(
      flatten(approvedNavigation(groups, () => true, allowed)).some((i) => i.label === 'Diary'),
    ).toBe(false)
    const result = flatten(approvedNavigation(groups, () => true, allowed, 'selected-property'))
    expect(result.find((i) => i.label === 'Diary')?.href).toBe(
      '/hospitality/properties/selected-property/diary',
    )
    expect(result.find((i) => i.label === 'Manager Sign-off')).toBeUndefined()
    allowed.add('hospitality.manager-signoff')
    expect(
      flatten(approvedNavigation(groups, () => true, allowed, 'selected-property')).find(
        (i) => i.label === 'Manager Sign-off',
      )?.href,
    ).toBe('/hospitality/properties/selected-property/signoff')
    expect(result.find((i) => i.label === 'Approvals')).toBeUndefined()
  })
  it('preserves custom links and pinned forms without mutating preferences', () => {
    const groups = [
      { label: 'My group', items: [item('/custom'), item('/apps/templates/abc/records')] },
    ]
    const before = structuredClone(groups)
    expect(approvedNavigation(groups, () => false, new Set())).toEqual(before)
    expect(groups).toEqual(before)
  })
  it('matches query tabs without confusing their active states', () => {
    const groups = [
      {
        items: [
          item('/hospitality/metering?tab=history'),
          item('/hospitality/metering?tab=setup'),
          item('/hospitality/metering'),
        ],
      },
    ]
    expect(findActiveNavHref('/hospitality/metering?tab=history&q=test', groups)).toBe(
      '/hospitality/metering?tab=history',
    )
    expect(findActiveNavHref('/hospitality/metering?tab=setup', groups)).toBe(
      '/hospitality/metering?tab=setup',
    )
    expect(findActiveNavHref('/hospitality/metering-elsewhere', groups)).toBeNull()
  })
})

it('continues to exclude legacy suppressed modules from default preferences', () => {
  const keys = buildDefaultNavConfig()
    .groups.flatMap((group) => group.items)
    .map((item) => (item.kind === 'module' ? item.moduleKey : ''))
  expect(keys).not.toContain('ppe')
  expect(keys).not.toContain('tools')
  expect(keys).not.toContain('locations')
})
