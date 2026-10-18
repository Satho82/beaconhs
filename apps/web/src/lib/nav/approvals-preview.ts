import type { SidebarNavGroup } from '@/components/sidebar-nav'
import { PREVIEW_ROOT, PREVIEW_SCREENS } from '@/lib/approvals/preview-fixtures'
import { APPROVED_APPLICATION_GROUPS } from './approved-structure'

// Preview-scoped projection; does not publish new routes in the governed registry.
const icons: Record<string, string> = {
  Dashboard: 'grid',
  'Daily Hotel': 'gauge',
  'Diary & Tasks': 'clipboard',
  Maintenance: 'wrench',
  Compliance: 'shield',
  Risk: 'alert',
  Inspections: 'clipboard',
  Incidents: 'alert',
  'Action Plans': 'list-checks',
  Training: 'grad',
  People: 'users',
  Handover: 'journal',
  'Assets & Reminders': 'layers',
  Metering: 'gauge',
  Reporting: 'file',
  Approvals: 'check',
  'Tenant Settings': 'settings',
}
export const APPROVALS_PREVIEW_NAV: SidebarNavGroup[] = [
  {
    label: 'Application',
    items: APPROVED_APPLICATION_GROUPS.filter((name) => name !== 'Reports').map((name) => ({
      moduleKey: name,
      label: name,
      iconKey: icons[name] ?? 'grid',
      href:
        name === 'Approvals'
          ? PREVIEW_ROOT
          : `${PREVIEW_ROOT}/unavailable?module=${encodeURIComponent(name)}`,
      exact: name !== 'Approvals',
      ...(name === 'Approvals'
        ? {
            children: PREVIEW_SCREENS.map(([key, label]) => ({
              href: key === 'overview' ? PREVIEW_ROOT : `${PREVIEW_ROOT}/${key}`,
              label,
              iconKey: 'file',
              exact: true,
            })),
          }
        : {}),
    })),
  },
]
