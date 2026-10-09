'use client'

// Platform (super-admin) sidebar navigation. When the user is anywhere under
// /platform, the main left sidebar is REPLACED by these items (instead of the
// tenant module nav). A small static set — the platform area is fixed, not
// tenant-customisable. Consumed by AppSidebar, MobileNavToggle and MobileTabBar.

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { SidebarNavGroup } from './sidebar-nav'

export const PLATFORM_NAV_GROUPS: SidebarNavGroup[] = [
  {
    label: 'Platform',
    labelKey: 'Shell.platform',
    items: [
      {
        href: '/platform',
        label: 'Dashboard',
        iconKey: 'grid',
        groupOnly: true,
        children: [
          {
            href: '/platform',
            label: 'Platform Overview',
            iconKey: 'grid',
            exact: true,
          },
        ],
      },
      {
        href: '/platform/tenants',
        label: 'Tenants',
        iconKey: 'building',
        groupOnly: true,
        children: [
          {
            href: '/platform/tenants',
            label: 'All Tenants',
            iconKey: 'building',
            exact: true,
          },
          {
            href: '/platform/tenants/new',
            label: 'Add Tenant',
            iconKey: 'building',
            exact: false,
          },
        ],
      },
      {
        href: '/platform/users',
        label: 'Platform Users',
        iconKey: 'users',
        groupOnly: true,
        children: [
          {
            href: '/platform/users',
            label: 'All Platform Users',
            iconKey: 'users',
            exact: false,
          },
        ],
      },
      {
        href: '/platform/modules',
        label: 'Modules',
        iconKey: 'layers',
        groupOnly: true,
        children: [
          {
            href: '/platform/modules',
            label: 'All Modules',
            iconKey: 'layers',
            exact: true,
          },
        ],
      },
      {
        href: '/platform/settings',
        label: 'Global Settings',
        iconKey: 'settings',
        groupOnly: true,
        children: [
          {
            href: '/platform/settings',
            label: 'General Settings',
            iconKey: 'settings',
            exact: false,
          },
        ],
      },
      {
        href: '/platform/branding',
        label: 'Branding & White Label',
        iconKey: 'sparkles',
        groupOnly: true,
        children: [
          {
            href: '/platform/branding',
            label: 'Platform Branding',
            iconKey: 'sparkles',
            exact: false,
          },
        ],
      },
      {
        href: '/platform/email',
        label: 'Email & Communications',
        iconKey: 'mail',
        groupOnly: true,
        children: [
          {
            href: '/platform/email',
            label: 'Email Settings',
            iconKey: 'mail',
            exact: false,
          },
          {
            href: '/platform/sms',
            label: 'SMS Settings',
            iconKey: 'mail',
            exact: false,
          },
          {
            href: '/platform/email-log',
            label: 'Communication Log',
            iconKey: 'mail',
            exact: false,
          },
          {
            href: '/platform/sms-log',
            label: 'SMS log',
            iconKey: 'mail',
            exact: false,
          },
        ],
      },
      {
        href: '/platform/ai',
        label: 'Data & Integrations',
        iconKey: 'database',
        groupOnly: true,
        children: [
          {
            href: '/platform/ai',
            label: 'AI provider',
            iconKey: 'database',
            exact: false,
          },
          {
            href: '/platform/tenants/seed-templates',
            label: 'Template seeding utility',
            iconKey: 'database',
            exact: false,
          },
        ],
      },
      {
        href: '/platform/database',
        label: 'System & Releases',
        iconKey: 'database',
        groupOnly: true,
        children: [
          {
            href: '/platform/database',
            label: 'Database maintenance',
            iconKey: 'database',
            exact: false,
          },
        ],
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
  const translateItem = (
    item: SidebarNavGroup['items'][number],
  ): SidebarNavGroup['items'][number] => ({
    ...item,
    label: item.labelKey ? t(item.labelKey as never) : item.label,
    children: item.children?.map(translateItem),
  })
  return groups.map((group) => ({
    ...group,
    label: group.labelKey ? t(group.labelKey as never) : group.label,
    items: group.items.map(translateItem),
  }))
}
