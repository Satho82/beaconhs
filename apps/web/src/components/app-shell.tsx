import { GeneratedValue } from '@/i18n/generated'
import { ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AccountMenu } from './account-menu'
import { TenantSwitcher } from './tenant-switcher'
import { RoleSwitcher } from './role-switcher'
import { PlatformMenu } from './platform-menu'
import { NotificationsBell } from './notifications-bell'
import { GlobalSearch } from './global-search'
import { AssistantLauncher } from './assistant-launcher'
import { type SidebarNavGroup } from './sidebar-nav'
import { AppSidebar } from './app-sidebar'
import { MobileNavProvider } from './mobile-nav'
import { MobileNavToggle } from './mobile-nav-toggle'
import { MobileTabBar } from './mobile-tab-bar'
import { ServiceWorkerRegistrar } from './service-worker-registrar'
import { ImpersonationBanner } from './impersonation-banner'
import { AppScrollReset } from './app-scroll-reset'
import type { PlatformBranding } from '@/lib/platform-branding-config'
import { HospitalityPropertySwitcher } from './hospitality-property-switcher'

type Ctx = {
  isSuperAdmin: boolean
  membership?: { displayName: string } | null
  tenantId: string
  tenantName: string
}

export function AppShell({
  ctx,
  platformBranding,
  account,
  groups,
  availableTenants,
  availableRoles,
  activeRole,
  propertyContext,
  unreadCount,
  defaultCollapsed = false,
  deploymentVersion,
  deploymentEnvironment,
  impersonation = null,
  canUseAssistant = false,
  children,
}: {
  ctx: Ctx
  platformBranding?: PlatformBranding
  /** The real signed-in user's display name + email, shown in the account menu. */
  account: { name: string; email: string }
  // Resolved server-side from the module registry + the tenant's saved nav
  // config, already filtered to what this user may open. See
  // apps/web/src/lib/nav/resolve.ts.
  groups: SidebarNavGroup[]
  availableTenants: { id: string; name: string; slug: string }[]
  /** Distinct roles assigned to the user in the active tenant (for the switcher). */
  availableRoles: { id: string; name: string; key: string }[]
  /** The role the user is currently acting under (`id: null` = all roles). */
  activeRole: { id: string | null; name: string }
  propertyContext: { activePropertyId: string | null; properties: { id: string; name: string }[] }
  unreadCount: number
  /** Persisted sidebar-collapsed preference (from the `sidebar_collapsed` cookie). */
  defaultCollapsed?: boolean
  deploymentVersion?: string
  deploymentEnvironment?: string
  /** Set only while this request is impersonating — drives the global banner. */
  impersonation?: { actorName: string; targetName: string; expiresAtMs: number } | null
  /** Whether to show the ⌘K assistant launcher (user holds assistant.use). */
  canUseAssistant?: boolean
  children: React.ReactNode
}) {
  const t = useTranslations('Shell')
  return (
    <div className="flex [height:100dvh] h-screen overflow-hidden">
      <ServiceWorkerRegistrar unreadCount={unreadCount} />
      <AppSidebar
        groups={groups}
        defaultCollapsed={defaultCollapsed}
        platformBranding={platformBranding}
        deploymentVersion={deploymentVersion}
        deploymentEnvironment={deploymentEnvironment}
      />

      <MobileNavProvider>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden [padding-top:env(safe-area-inset-top)]">
          <GeneratedValue
            value={
              impersonation ? (
                <ImpersonationBanner
                  actorName={impersonation.actorName}
                  targetName={impersonation.targetName}
                  expiresAtMs={impersonation.expiresAtMs}
                />
              ) : null
            }
          />
          <GeneratedValue
            value={
              ctx.isSuperAdmin ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1 text-xs text-amber-900 sm:px-6 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span className="truncate">
                    <GeneratedValue value={t('superAdminScopedTo')} />{' '}
                    <strong>
                      <GeneratedValue value={ctx.tenantName} />
                    </strong>
                  </span>
                </div>
              ) : null
            }
          />

          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
            <MobileNavToggle groups={groups} platformBranding={platformBranding} />
            <div className="min-w-0 flex-1 md:flex-none">
              <TenantSwitcher
                current={{ id: ctx.tenantId, name: ctx.tenantName }}
                available={availableTenants}
                isSuperAdmin={ctx.isSuperAdmin}
              />
            </div>
            <div className="hidden min-w-0 md:block">
              <RoleSwitcher current={activeRole} available={availableRoles} />
            </div>
            <div className="hidden min-w-0 md:block">
              <HospitalityPropertySwitcher {...propertyContext} />
            </div>
            <GeneratedValue value={ctx.isSuperAdmin ? <PlatformMenu /> : null} />
            <div className="hidden flex-1 justify-center md:flex">
              <GlobalSearch />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5 text-sm sm:gap-3 md:ml-0">
              <GeneratedValue value={canUseAssistant ? <AssistantLauncher /> : null} />
              <NotificationsBell unread={unreadCount} />
              <AccountMenu
                name={account.name}
                email={account.email}
                isSuperAdmin={ctx.isSuperAdmin}
              />
            </div>
          </header>

          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b bg-white px-3 py-2 text-xs md:hidden dark:bg-slate-900">
            <div className="max-w-full min-w-0">
              <RoleSwitcher current={activeRole} available={availableRoles} />
            </div>
            {propertyContext.properties.length > 0 && (
              <div className="flex max-w-full min-w-0 items-center gap-2">
                <span className="shrink-0 text-slate-500">Property</span>
                <HospitalityPropertySwitcher {...propertyContext} />
              </div>
            )}
          </div>

          <main
            data-app-main
            className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[rgb(var(--color-canvas))]"
          >
            <AppScrollReset />
            <GeneratedValue value={children} />
          </main>

          <MobileTabBar groups={groups} />
        </div>
      </MobileNavProvider>
    </div>
  )
}
