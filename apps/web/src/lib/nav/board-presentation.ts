import type { SidebarNavGroup } from '@/components/sidebar-nav'

// Presentation only: input has already passed the existing entitlement/RBAC
// resolver. Saved preferences and underlying records are never mutated.
const DESTINATIONS: Record<string, [string, string?]> = {
  '/dashboard': ['Overview'],
  '/my': ['Overview', 'My Work'],
  '/hospitality/properties': ['Properties', 'Properties'],
  '/hospitality/maintenance': ['Operations', 'Maintenance'],
  '/hospitality/handover': ['Operations', 'Handover'],
  '/corrective-actions': ['Operations'],
  '/journals': ['Operations'],
  '/compliance': ['Safety & Compliance'],
  '/inspections': ['Safety & Compliance', 'Inspections'],
  '/incidents': ['Safety & Compliance'],
  '/hospitality/risk': ['Safety & Compliance', 'Risk'],
  '/hazard-assessments': ['Safety & Compliance'],
  '/training': ['Safety & Compliance'],
  '/equipment': ['Assets', 'Assets'],
  '/hospitality/metering': ['Assets', 'Metering'],
  '/people': ['People'],
  '/reports': ['Reports'],
  '/insights': ['Reports'],
  '/admin': ['Administration', 'Administration'],
  '/admin/settings': ['Administration'],
  '/apps': ['Administration'],
  '/help': ['Resources'],
  '/documents': ['Resources'],
}
const ORDER = [
  'Overview',
  'Properties',
  'Operations',
  'Safety & Compliance',
  'Assets',
  'People',
  'Reports',
  'Administration',
  'Resources',
]
export function boardNavigation(groups: SidebarNavGroup[]): SidebarNavGroup[] {
  const output = new Map<string, SidebarNavGroup>()
  for (const group of groups)
    for (const item of group.items) {
      if (
        ['/tools', '/ppe', '/locations'].some(
          (path) => item.href === path || item.href.startsWith(path + '/'),
        )
      )
        continue
      const destination = DESTINATIONS[item.href]
      const label =
        destination?.[0] ?? (item.href.startsWith('/apps/templates/') ? 'Resources' : group.label)
      const target = output.get(label) ?? { label, items: [] }
      target.items.push(
        destination?.[1] ? { ...item, label: destination[1], labelKey: undefined } : item,
      )
      output.set(label, target)
    }
  return [...output.values()].sort((a, b) => {
    const rank = (label: string) => (ORDER.includes(label) ? ORDER.indexOf(label) : ORDER.length)
    return rank(a.label) - rank(b.label)
  })
}
