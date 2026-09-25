import { GeneratedValue } from '@/i18n/generated'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPlatformOperator } from '@/lib/auth'

// This is an explicit platform-only boundary. Tenant pages may use a selected
// tenant context, but control-centre operations never rely on it for authority.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const operator = await getPlatformOperator()
  if (!operator) redirect('/admin')
  const t = await getGeneratedValueTranslations()
  const platformNavigation = [
    { href: '/platform', label: t('Dashboard') },
    { href: '/platform/tenants', label: t('Management companies') },
    { href: '/platform/users', label: t('Platform users') },
    { href: '/platform/email', label: t('Communications') },
    { href: '/platform/branding', label: t('Branding') },
    { href: '/platform/database', label: t('System health') },
  ]

  return (
    <GeneratedValue
      value={
        <div className="min-h-full">
          <header className="border-b border-violet-300 bg-violet-50 px-4 py-2 sm:px-6 dark:border-violet-800/60 dark:bg-violet-950/40">
            <div className="mx-auto max-w-[1600px] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/platform"
                  className="text-sm font-semibold tracking-wide text-violet-950 dark:text-violet-100"
                >
                  {t('Uvanoo Platform Control Centre')}
                </Link>
                <span className="text-xs font-medium text-violet-800 dark:text-violet-200">
                  {t('Platform context · tenant and property scope do not grant platform authority')}
                </span>
              </div>
              <nav
                aria-label={t('Platform navigation')}
                className="flex flex-wrap gap-3 text-sm"
              >
                {platformNavigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-violet-900 hover:underline dark:text-violet-100"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          {children}
        </div>
      }
    />
  )
}
