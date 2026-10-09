'use client'

import { useGeneratedValueTranslations } from '@/i18n/generated'

import { GeneratedValue } from '@/i18n/generated'
import { LogOut, ShieldCheck, Search, ArrowLeft } from 'lucide-react'
import { useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
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
  deploymentVersion,
  deploymentEnvironment,
  children,
}: {
  operator: { name: string; email: string }
  branding: PlatformBranding
  defaultCollapsed: boolean
  deploymentVersion?: string
  deploymentEnvironment?: string
  children: React.ReactNode
}) {
  const tVisual = useGeneratedValueTranslations()

  const tBatch = useTranslations('Generated')

  const router = useRouter()
  const [pending, startSignOut] = useTransition()
  const shellT = useTranslations('Shell')
  const groups = PLATFORM_NAV_GROUPS

  return (
    <div
      className="flex [height:100dvh] h-screen overflow-hidden"
      style={{ '--tenant-primary-action': branding.primaryColor || '#0066FF' } as CSSProperties}
    >
      <AppSidebar
        groups={groups}
        defaultCollapsed={defaultCollapsed}
        platformBranding={branding}
        deploymentVersion={deploymentVersion}
        deploymentEnvironment={deploymentEnvironment}
      />
      <MobileNavProvider>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden [padding-top:env(safe-area-inset-top)]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
            <MobileNavToggle groups={groups} platformBranding={branding} />
            <div className="flex min-w-0 items-center gap-2">
              <ShieldCheck className="shrink-0 text-teal-700 dark:text-teal-300" size={18} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  <GeneratedValue value={'Platform Admin'} />
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  <GeneratedValue value={'Platform workspace'} />
                </div>
              </div>
            </div>
            <form
              action="/platform/tenants"
              method="get"
              role="search"
              className="ml-auto hidden max-w-sm flex-1 items-center gap-2 rounded-md border px-3 py-1.5 md:flex"
            >
              <Search size={16} className="text-slate-500" aria-hidden="true" />
              <input
                name="q"
                type="search"
                aria-label={tBatch('m_0c689200391562')}
                placeholder={tBatch('m_14a8d76ad4905b')}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button type="submit" className="text-sm font-medium text-blue-700">
                {tBatch('m_1417e84947b481')}
              </button>
            </form>
            <Link
              href="/dashboard"
              className="ml-auto flex items-center gap-2 text-sm text-blue-700 md:ml-0"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">{tBatch('m_13f8c9c1ebe799')}</span>
              <span className="sr-only sm:hidden">{tBatch('m_13f8c9c1ebe799')}</span>
            </Link>
            <details className="relative shrink-0">
              <summary
                className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 focus-visible:outline-2 focus-visible:outline-blue-600"
                aria-label={tBatch('m_05031e4f8d641e')}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-sm font-semibold text-blue-800">
                  {(operator.name || operator.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-44 text-sm xl:block">
                  <span className="block truncate font-semibold">{operator.name}</span>
                  <span className="block text-xs text-blue-700">
                    {tVisual('Platform Super Admin')}
                  </span>
                </span>
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-white p-3 shadow-lg dark:bg-slate-900">
                <p className="truncate text-sm font-semibold">{operator.name}</p>
                <p className="mb-3 truncate text-xs text-slate-500">{operator.email}</p>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={shellT('signOut')}
                  onClick={() =>
                    startSignOut(async () => {
                      await signOut()
                      router.replace('/login')
                    })
                  }
                  className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">
                    <GeneratedValue value={shellT('signOut')} />
                  </span>
                </button>
              </div>
            </details>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[rgb(var(--color-canvas))]">
            <AppScrollReset />
            <GeneratedValue value={children} />
          </main>
        </div>
      </MobileNavProvider>
    </div>
  )
}
