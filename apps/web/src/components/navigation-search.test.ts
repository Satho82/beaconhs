import { describe, expect, it } from 'vitest'
import { searchNavigation } from './navigation-search'
const groups = [
  {
    label: 'Application',
    items: [
      {
        label: 'Tenant Settings',
        href: '/admin/settings',
        iconKey: 'settings',
        children: [
          { label: 'General', href: '/admin/settings', iconKey: 'settings' },
          { label: 'Modules', href: '/admin/settings/modules', iconKey: 'layers' },
        ],
      },
      { label: 'Reports', href: '/reports', iconKey: 'file' },
    ],
  },
]
describe('authorised navigation search', () => {
  it('keeps the original complete tree for blank search', () =>
    expect(searchNavigation(groups, '  ')).toBe(groups))
  it('finds child labels, retains ancestry and omits unrelated destinations', () => {
    const result = searchNavigation(groups, '  MODULES ')
    expect(result[0]?.items).toHaveLength(1)
    expect(result[0]?.items[0]?.children?.map((item) => item.label)).toEqual(['Modules'])
    expect(groups[0]?.items[0]?.children).toHaveLength(2)
  })
  it('retains all authorised children when the parent matches', () =>
    expect(searchNavigation(groups, 'tenant')[0]?.items[0]?.children).toHaveLength(2))
  it('does not fabricate an unavailable module', () =>
    expect(searchNavigation(groups, 'Approvals')).toEqual([]))
})
