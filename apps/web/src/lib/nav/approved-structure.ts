import type { SidebarNavGroup, SidebarNavItem } from '@/components/sidebar-nav'
import type { ModuleKey } from '@/lib/module-entitlements/catalogue'

/** G03 order. Empty/unimplemented groups remain in the ledger, never as dead links. */
export const APPROVED_APPLICATION_GROUPS = [
  'Dashboard',
  'Daily Hotel',
  'Diary & Tasks',
  'Maintenance',
  'Compliance',
  'Risk',
  'Inspections',
  'Incidents',
  'Action Plans',
  'Training',
  'People',
  'Handover',
  'Assets & PPM',
  'Metering',
  'Reporting',
  'Reports',
  'Approvals',
  'Tenant Settings',
] as const

type ApprovedDestination = {
  id: string
  group: string
  label: string
  href: string
  source: string
  permission: string | null
  anyPermissions?: readonly string[]
  entitlement: ModuleKey | null
}

const APPROVED_DESTINATIONS: readonly ApprovedDestination[] = [
  {
    id: 'A004',
    group: 'Dashboard',
    label: 'Compliance Status',
    href: '/compliance',
    source: '/compliance',
    permission: 'compliance.read',
    entitlement: 'hospitality.compliance',
  },
  {
    id: 'A005',
    group: 'Dashboard',
    label: 'Open Actions',
    href: '/corrective-actions',
    source: '/corrective-actions',
    permission: null,
    entitlement: null,
    anyPermissions: ['ca.read.self', 'ca.read.site', 'ca.read.all'],
  },
  {
    id: 'A008',
    group: 'Dashboard',
    label: 'Alerts / Expiries',
    href: '/compliance/expiring',
    source: '/compliance',
    permission: 'compliance.read',
    entitlement: 'hospitality.compliance',
  },
  {
    id: 'A009',
    group: 'Dashboard',
    label: 'Custom Widgets',
    href: '/dashboard/customize',
    source: '/dashboard',
    permission: null,
    entitlement: null,
  },
  {
    id: 'A022',
    group: 'Diary & Tasks',
    label: 'My Tasks',
    href: '/my/tasks',
    source: '/my',
    permission: null,
    entitlement: null,
  },
  {
    id: 'A029',
    group: 'Maintenance',
    label: 'Report Issue',
    href: '/hospitality/maintenance/report',
    source: '/hospitality/maintenance',
    permission: 'maintenance.create',
    entitlement: 'hospitality.maintenance',
  },
  {
    id: 'A030',
    group: 'Maintenance',
    label: 'Maintenance Queue',
    href: '/hospitality/maintenance',
    source: '/hospitality/maintenance',
    permission: 'maintenance.read',
    entitlement: 'hospitality.maintenance',
  },
  {
    id: 'A038',
    group: 'Compliance',
    label: 'Compliance Dashboard',
    href: '/compliance',
    source: '/compliance',
    permission: 'compliance.read',
    entitlement: 'hospitality.compliance',
  },
  {
    id: 'A039',
    group: 'Compliance',
    label: 'Compliance Register',
    href: '/compliance/obligations',
    source: '/compliance',
    permission: 'compliance.read',
    entitlement: 'hospitality.compliance',
  },
  {
    id: 'A041',
    group: 'Compliance',
    label: 'Expiries',
    href: '/compliance/expiring',
    source: '/compliance',
    permission: 'compliance.read',
    entitlement: 'hospitality.compliance',
  },
  {
    id: 'A048',
    group: 'Risk',
    label: 'Risk Assessments',
    href: '/hospitality/risk',
    source: '/hospitality/risk',
    permission: 'hospitality.read',
    entitlement: null,
  },
  {
    id: 'A054',
    group: 'Risk',
    label: 'Review Schedule',
    href: '/hospitality/risk?due=due',
    source: '/hospitality/risk',
    permission: 'hospitality.read',
    entitlement: null,
  },
  {
    id: 'A058',
    group: 'Inspections',
    label: 'New Inspection',
    href: '/inspections/records?drawer=new',
    source: '/inspections',
    permission: 'inspections.read.self',
    entitlement: null,
    anyPermissions: ['inspections.create'],
  },
  {
    id: 'A059',
    group: 'Inspections',
    label: 'Inspection Records',
    href: '/inspections/records',
    source: '/inspections',
    permission: 'inspections.read.self',
    entitlement: null,
  },
  {
    id: 'A062',
    group: 'Inspections',
    label: 'Inspection Templates',
    href: '/inspections/types',
    source: '/inspections',
    permission: 'inspections.manage',
    entitlement: null,
  },
  {
    id: 'A065',
    group: 'Inspections',
    label: 'Settings',
    href: '/inspections/manage',
    source: '/inspections',
    permission: 'inspections.manage',
    entitlement: null,
  },
  {
    id: 'A066',
    group: 'Incidents',
    label: 'Report Incident',
    href: '/incidents/new',
    source: '/incidents',
    permission: 'incidents.create',
    entitlement: null,
  },
  {
    id: 'A067',
    group: 'Incidents',
    label: 'Incident Register',
    href: '/incidents',
    source: '/incidents',
    permission: null,
    entitlement: null,
    anyPermissions: ['incidents.read.self', 'incidents.read.all', 'incidents.read.site'],
  },
  {
    id: 'A070',
    group: 'Incidents',
    label: 'Lost Time',
    href: '/incidents/hours',
    source: '/incidents',
    permission: 'incidents.read.all',
    entitlement: null,
  },
  {
    id: 'A073',
    group: 'Incidents',
    label: 'Incident Types',
    href: '/incidents/classifications',
    source: '/incidents',
    permission: 'incidents.read.all',
    entitlement: null,
  },
  {
    id: 'A074',
    group: 'Incidents',
    label: 'Settings',
    href: '/incidents/manage',
    source: '/incidents',
    permission: 'incidents.read.all',
    entitlement: null,
  },
  {
    id: 'A075',
    group: 'Action Plans',
    label: 'Open Actions',
    href: '/corrective-actions',
    source: '/corrective-actions',
    permission: null,
    entitlement: null,
    anyPermissions: ['ca.read.self', 'ca.read.all', 'ca.read.site'],
  },
  {
    id: 'A077',
    group: 'Action Plans',
    label: 'Overdue',
    href: '/corrective-actions/reports/overdue',
    source: '/corrective-actions',
    permission: null,
    entitlement: null,
    anyPermissions: ['ca.read.self', 'ca.read.all', 'ca.read.site'],
  },
  {
    id: 'A078',
    group: 'Action Plans',
    label: 'Completed',
    href: '/corrective-actions?status=closed',
    source: '/corrective-actions',
    permission: null,
    entitlement: null,
    anyPermissions: ['ca.read.self', 'ca.read.all', 'ca.read.site'],
  },
  {
    id: 'A079',
    group: 'Action Plans',
    label: 'Action History',
    href: '/corrective-actions?status=all',
    source: '/corrective-actions',
    permission: null,
    entitlement: null,
    anyPermissions: ['ca.read.self', 'ca.read.all', 'ca.read.site'],
  },
  {
    id: 'A083',
    group: 'Action Plans',
    label: 'Settings',
    href: '/corrective-actions/manage',
    source: '/corrective-actions',
    permission: 'ca.update',
    entitlement: null,
  },
  {
    id: 'A085',
    group: 'Training',
    label: 'Training Matrix',
    href: '/training/skills',
    source: '/training',
    permission: null,
    entitlement: null,
    anyPermissions: ['training.read.self', 'training.read.all', 'training.course.manage'],
  },
  {
    id: 'A086',
    group: 'Training',
    label: 'Courses',
    href: '/training/courses',
    source: '/training',
    permission: null,
    entitlement: null,
  },
  {
    id: 'A087',
    group: 'Training',
    label: 'Assessments',
    href: '/training/assessments',
    source: '/training',
    permission: null,
    entitlement: null,
    anyPermissions: [
      'training.read.self',
      'training.read.all',
      'training.record.create',
      'training.class.manage',
    ],
  },
  {
    id: 'A088',
    group: 'Training',
    label: 'Training Records',
    href: '/training/records',
    source: '/training',
    permission: null,
    entitlement: null,
    anyPermissions: ['training.read.self', 'training.read.all'],
  },
  {
    id: 'A090',
    group: 'Training',
    label: 'Training Providers',
    href: '/training/authorities',
    source: '/training',
    permission: 'training.course.manage',
    entitlement: null,
  },
  {
    id: 'A092',
    group: 'Training',
    label: 'Settings',
    href: '/training/manage',
    source: '/training',
    permission: 'training.course.manage',
    entitlement: null,
  },
  {
    id: 'A093',
    group: 'People',
    label: 'Staff Directory',
    href: '/people',
    source: '/people',
    permission: null,
    entitlement: null,
  },
  {
    id: 'A094',
    group: 'People',
    label: 'Teams',
    href: '/people/groups',
    source: '/people',
    permission: 'admin.org.manage',
    entitlement: null,
  },
  {
    id: 'A096',
    group: 'People',
    label: 'Roles',
    href: '/admin/roles',
    source: '/admin',
    permission: 'admin.roles.manage',
    entitlement: null,
  },
  {
    id: 'A100',
    group: 'People',
    label: 'Access Management',
    href: '/admin/users',
    source: '/admin',
    permission: 'admin.users.manage',
    entitlement: null,
  },
  {
    id: 'A101',
    group: 'People',
    label: 'Settings',
    href: '/people/manage',
    source: '/people',
    permission: 'admin.org.manage',
    entitlement: null,
  },
  {
    id: 'A102',
    group: 'Handover',
    label: 'Current Handover',
    href: '/hospitality/handover',
    source: '/hospitality/handover',
    permission: 'hospitality.read',
    entitlement: null,
  },
  {
    id: 'A110',
    group: 'Assets & PPM',
    label: 'Asset Register',
    href: '/equipment',
    source: '/equipment',
    permission: null,
    entitlement: null,
    anyPermissions: ['equipment.read.self', 'equipment.read.all', 'equipment.read.site'],
  },
  {
    id: 'A111',
    group: 'Assets & PPM',
    label: 'Asset Categories',
    href: '/equipment/categories',
    source: '/equipment',
    permission: 'equipment.manage',
    entitlement: null,
  },
  {
    id: 'A112',
    group: 'Assets & PPM',
    label: 'PPM Schedule',
    href: '/equipment/maintenance',
    source: '/equipment',
    permission: null,
    entitlement: null,
    anyPermissions: ['equipment.read.self', 'equipment.read.all', 'equipment.read.site'],
  },
  {
    id: 'A118',
    group: 'Assets & PPM',
    label: 'Settings',
    href: '/equipment/manage',
    source: '/equipment',
    permission: 'equipment.manage',
    entitlement: null,
  },
  {
    id: 'A119',
    group: 'Metering',
    label: 'Meter Dashboard',
    href: '/hospitality/metering?tab=overview',
    source: '/hospitality/metering',
    permission: 'hospitality.read',
    entitlement: null,
  },
  {
    id: 'A123',
    group: 'Metering',
    label: 'Meter Readings',
    href: '/hospitality/metering?tab=history',
    source: '/hospitality/metering',
    permission: 'hospitality.read',
    entitlement: null,
  },
  {
    id: 'A124',
    group: 'Metering',
    label: 'Consumption Trends',
    href: '/hospitality/metering?tab=analytics',
    source: '/hospitality/metering',
    permission: 'hospitality.read',
    entitlement: null,
  },
  {
    id: 'A126',
    group: 'Metering',
    label: 'Settings',
    href: '/hospitality/metering?tab=setup',
    source: '/hospitality/metering',
    permission: 'hospitality.manage',
    entitlement: null,
  },
  {
    id: 'A142',
    group: 'Reports',
    label: 'Custom Reports',
    href: '/reports/definitions/new',
    source: '/reports',
    permission: 'reports.builder',
    entitlement: null,
  },
  {
    id: 'A143',
    group: 'Reports',
    label: 'Export Centre',
    href: '/admin/export',
    source: '/admin',
    permission: 'admin.data.export',
    entitlement: null,
  },
  {
    id: 'A144',
    group: 'Reports',
    label: 'Scheduled Reports',
    href: '/reports/schedules',
    source: '/reports',
    permission: 'reports.schedule',
    entitlement: null,
  },
  {
    id: 'A152',
    group: 'Tenant Settings',
    label: 'General',
    href: '/admin/settings',
    source: '/admin/settings',
    permission: 'admin.settings.manage',
    entitlement: null,
  },
  {
    id: 'A153',
    group: 'Tenant Settings',
    label: 'Properties',
    href: '/hospitality/properties',
    source: '/hospitality/properties',
    permission: 'hospitality.read',
    entitlement: 'hospitality.properties',
  },
  {
    id: 'A156',
    group: 'Tenant Settings',
    label: 'Users & Access',
    href: '/admin/users',
    source: '/admin',
    permission: 'admin.users.manage',
    entitlement: null,
  },
  {
    id: 'A157',
    group: 'Tenant Settings',
    label: 'Modules',
    href: '/admin/settings/modules',
    source: '/admin/settings',
    permission: 'admin.settings.manage',
    entitlement: null,
  },
  {
    id: 'A158',
    group: 'Tenant Settings',
    label: 'Notifications',
    href: '/admin/notifications',
    source: '/admin/settings',
    permission: 'admin.settings.manage',
    entitlement: null,
  },
  {
    id: 'A159',
    group: 'Tenant Settings',
    label: 'Integrations',
    href: '/admin/integrations',
    source: '/admin',
    permission: 'admin.integrations.manage',
    entitlement: null,
  },
  {
    id: 'A160',
    group: 'Tenant Settings',
    label: 'Import / Export',
    href: '/admin/settings/import-export',
    source: '/admin/settings',
    permission: 'admin.settings.manage',
    entitlement: null,
  },
  {
    id: 'A161',
    group: 'Tenant Settings',
    label: 'Tenant Branding',
    href: '/admin/settings/branding',
    source: '/admin/settings',
    permission: 'admin.settings.manage',
    entitlement: null,
  },
  {
    id: 'A162',
    group: 'Tenant Settings',
    label: 'Data Management',
    href: '/admin/export',
    source: '/admin',
    permission: 'admin.data.export',
    entitlement: null,
  },
  {
    id: 'A163',
    group: 'Tenant Settings',
    label: 'Templates',
    href: '/apps',
    source: '/apps',
    permission: 'forms.template.read',
    entitlement: null,
  },
  {
    id: 'A164',
    group: 'Tenant Settings',
    label: 'Audit Log',
    href: '/admin/audit',
    source: '/admin',
    permission: 'admin.audit.read',
    entitlement: null,
  },
  {
    id: 'A165',
    group: 'Tenant Settings',
    label: 'Advanced',
    href: '/admin/settings/advanced',
    source: '/admin/settings',
    permission: 'admin.settings.manage',
    entitlement: null,
  },
]

const PRESENTATION: Record<string, { iconKey: string; colour: SidebarNavItem['colour'] }> = {
  Dashboard: {
    iconKey: 'gauge',
    colour: 'blue',
  },
  'Daily Hotel': {
    iconKey: 'building',
    colour: 'blue',
  },
  'Diary & Tasks': {
    iconKey: 'clipboard',
    colour: 'blue',
  },
  Maintenance: {
    iconKey: 'wrench',
    colour: 'orange',
  },
  Compliance: {
    iconKey: 'shield',
    colour: 'emerald',
  },
  Risk: {
    iconKey: 'alert',
    colour: 'orange',
  },
  Inspections: {
    iconKey: 'clipboard-check',
    colour: 'blue',
  },
  Incidents: {
    iconKey: 'bell',
    colour: 'rose',
  },
  'Action Plans': {
    iconKey: 'list-checks',
    colour: 'orange',
  },
  Training: {
    iconKey: 'grad',
    colour: 'purple',
  },
  People: {
    iconKey: 'users',
    colour: 'blue',
  },
  Handover: {
    iconKey: 'journal',
    colour: 'emerald',
  },
  'Assets & PPM': {
    iconKey: 'layers',
    colour: 'orange',
  },
  Metering: {
    iconKey: 'gauge',
    colour: 'blue',
  },
  Reporting: {
    iconKey: 'file',
    colour: 'blue',
  },
  Reports: {
    iconKey: 'file',
    colour: 'blue',
  },
  Approvals: {
    iconKey: 'check',
    colour: 'purple',
  },
  'Tenant Settings': {
    iconKey: 'settings',
    colour: 'blue',
  },
}

/** Input retains the existing resolver's saved preferences, RBAC and entitlements.
 * Every additional child is independently gated. This function never writes preferences.
 */
export function approvedNavigation(
  groups: SidebarNavGroup[],
  permits: (permission: string) => boolean,
  entitlements: ReadonlySet<ModuleKey>,
  activePropertyId?: string | null,
): SidebarNavGroup[] {
  const visible = new Map(groups.flatMap((group) => group.items).map((item) => [item.href, item]))
  const consumed = new Set<string>()
  const items: SidebarNavItem[] = []
  for (const group of APPROVED_APPLICATION_GROUPS) {
    const children: SidebarNavItem[] = [...APPROVED_DESTINATIONS]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter(
        (entry) =>
          entry.group === group &&
          visible.has(entry.source) &&
          (!entry.permission || permits(entry.permission)) &&
          (!entry.anyPermissions || entry.anyPermissions.some(permits)) &&
          (!entry.entitlement || entitlements.has(entry.entitlement)),
      )
      .map((entry) => {
        consumed.add(entry.source)
        return {
          href: entry.href,
          label: entry.label,
          iconKey: PRESENTATION[group]!.iconKey,
          exact: entry.href === '/admin/settings',
        }
      })
    if (
      group === 'Diary & Tasks' &&
      activePropertyId &&
      visible.has('/hospitality/properties') &&
      permits('hospitality.read') &&
      entitlements.has('hospitality.diary')
    ) {
      children.unshift({
        href: `/hospitality/properties/${activePropertyId}/diary`,
        label: 'Diary',
        iconKey: 'clipboard',
        exact: false,
      })
      if (entitlements.has('hospitality.manager-signoff'))
        children.push({
          href: `/hospitality/properties/${activePropertyId}/signoff`,
          label: 'Manager Sign-off',
          iconKey: 'check',
          exact: false,
        })
    }
    if (!children.length) continue
    items.push({
      href: children[0]!.href,
      label: group,
      ...PRESENTATION[group]!,
      groupOnly: true,
      children,
    })
  }
  // Existing hubs/custom links/pinned forms remain reachable with their truthful labels.
  const remaining = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !consumed.has(item.href) ||
          !items.some((parent) => parent.children?.some((child) => child.href === item.href)),
      ),
    }))
    .filter((group) => group.items.length)
  return [...(items.length ? [{ label: 'Application', items }] : []), ...remaining]
}
