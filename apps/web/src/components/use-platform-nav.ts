'use client'

// Platform (super-admin) sidebar navigation. When the user is anywhere under
// /platform, the main left sidebar is REPLACED by these items (instead of the
// tenant module nav). A small static set — the platform area is fixed, not
// tenant-customisable. Consumed by AppSidebar, MobileNavToggle and MobileTabBar.

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { SidebarNavGroup } from './sidebar-nav'

/**
 * Complete control-centre information architecture. A null href is deliberate:
 * the area is reserved in the architecture but is not presented as working
 * navigation until a production implementation exists.
 */
const PLATFORM_CONTROL_CENTRE_AREAS = [
  { key: 'dashboard', labelKey: 'PlatformNav.dashboard', href: '/platform' },
  { key: 'tenants', labelKey: 'PlatformNav.managementCompanies', href: '/platform/tenants' },
  { key: 'properties', labelKey: 'PlatformNav.propertiesOverview', href: null },
  { key: 'users', labelKey: 'PlatformNav.platformUsers', href: '/platform/users' },
  { key: 'plans', labelKey: 'PlatformNav.plansSubscriptions', href: null },
  { key: 'modules', labelKey: 'PlatformNav.modulesEntitlements', href: '/platform/tenants' },
  {
    key: 'templates',
    labelKey: 'PlatformNav.templateLibrary',
    href: '/platform/tenants/seed-templates',
  },
  { key: 'product', labelKey: 'PlatformNav.productConfiguration', href: '/platform/ai' },
  { key: 'integrations', labelKey: 'PlatformNav.integrations', href: '/platform/email' },
  { key: 'communications', labelKey: 'PlatformNav.communications', href: '/platform/email-log' },
  { key: 'branding', labelKey: 'PlatformNav.platformBranding', href: '/platform/branding' },
  { key: 'settings', labelKey: 'PlatformNav.platformSettings', href: '/platform/database' },
  { key: 'audit', labelKey: 'PlatformNav.auditLogs', href: '/platform/email-log' },
  { key: 'health', labelKey: 'PlatformNav.systemHealth', href: null },
] as const

void PLATFORM_CONTROL_CENTRE_AREAS

export const PLATFORM_NAV_GROUPS: SidebarNavGroup[] = [
  {
    label: 'Platform',
    labelKey: 'Shell.platform',
    items: [
      {
        href: '/platform',
        label: 'Overview',
        labelKey: 'PlatformNav.overview',
        iconKey: 'grid',
        exact: true,
      },
      {
        href: '/platform/tenants',
        label: 'Tenants',
        labelKey: 'PlatformNav.tenants',
        iconKey: 'building',
        exact: true,
      },
      {
        href: '/platform/tenants/new',
        label: 'Create tenant',
        labelKey: 'PlatformNav.createTenant',
        iconKey: 'plus',
      },
      {
        href: '/platform/users',
        label: 'Users',
        labelKey: 'PlatformNav.users',
        iconKey: 'users',
      },
      {
        href: '/platform/tenants/seed-templates',
        label: '',
        labelKey: 'PlatformNav.templateLibrary',
        iconKey: 'library',
      },
      {
        href: '/platform/branding',
        label: '',
        labelKey: 'PlatformNav.platformBranding',
        iconKey: 'sparkles',
      },
      {
        href: '/platform/email',
        label: 'Platform email',
        labelKey: 'PlatformNav.platformEmail',
        iconKey: 'mail',
      },
      {
        href: '/platform/sms',
        label: 'SMS provider',
        labelKey: 'PlatformNav.smsProvider',
        iconKey: 'message',
      },
      {
        href: '/platform/ai',
        label: 'AI provider',
        labelKey: 'PlatformNav.aiProvider',
        iconKey: 'sparkles',
      },
      {
        href: '/platform/email-log',
        label: 'Email log',
        labelKey: 'PlatformNav.emailLog',
        iconKey: 'scroll',
      },
      {
        href: '/platform/sms-log',
        label: 'SMS log',
        labelKey: 'PlatformNav.smsLog',
        iconKey: 'scroll',
      },
      {
        href: '/platform/database',
        label: 'Database maintenance',
        labelKey: 'PlatformNav.databaseMaintenance',
        iconKey: 'database',
      },
    ],
  },
]

/** True when the current route is part of the platform (super-admin) area. */
function useIsPlatform(): boolean {
  return (usePathname() ?? '').startsWith('/platform')
}

/** The nav groups to render: platform nav under /platform, else the tenant nav. */
export function useNavGroups(tenantGroups: SidebarNavGroup[]): SidebarNavGroup[] {
  const t = useTranslations()
  const groups = useIsPlatform() ? PLATFORM_NAV_GROUPS : tenantGroups
  return groups.map((group) => ({
    ...group,
    label: group.labelKey ? t(group.labelKey as never) : group.label,
    items: group.items.map((item) => ({
      ...item,
      label: item.labelKey ? t(item.labelKey as never) : item.label,
    })),
  }))
}
