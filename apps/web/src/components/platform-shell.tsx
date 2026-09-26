'use client'

import { GeneratedValue } from '@/i18n/generated'
import { LogOut, ShieldCheck } from 'lucide-react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { signOut } from '@beaconhs/auth/client'
import { AppSidebar } from './app-sidebar'
import { MobileNavProvider } from './mobile-nav'
import { MobileNavToggle } from './mobile-nav-toggle'
import { AppScrollReset } from './app-scroll-reset'
import type { PlatformBranding } from '@/lib/platform-branding-config'
import { PLATFORM_NAV_GROUPS } from './use-platform-nav'

export function PlatformShell({
  operator,
  branding,
  defaultCollapsed,
  children,
}: {
  operator: { name: string; email: string }
  branding: PlatformBranding
  defaultCollapsed: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pending, startSignOut] = useTransition()
  const platformT = useTranslations('PlatformNav')
  const shellT = useTranslations('Shell')
  const groups = PLATFORM_NAV_GROUPS

  return (
    <div className="flex [height:100dvh] h-screen overflow-hidden">
      <AppSidebar groups={groups} defaultCollapsed={defaultCollapsed} platformBranding={branding} />
      <MobileNavProvider>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden [padding-top:env(safe-area-inset-top)]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
            <MobileNavToggle groups={groups} platformBranding={branding} />
            <div className="flex min-w-0 items-center gap-2">
              <ShieldCheck className="shrink-0 text-amber-600 dark:text-amber-400" size={18} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  <GeneratedValue value={platformT('controlCentre')} />
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  <GeneratedValue value={operator.email} />
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startSignOut(async () => {
                  await signOut()
                  router.replace('/login')
                })
              }
              className="ml-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">
                <GeneratedValue value={shellT('signOut')} />
              </span>
            </button>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
            <AppScrollReset />
            <GeneratedValue value={children} />
          </main>
        </div>
      </MobileNavProvider>
    </div>
  )
}
