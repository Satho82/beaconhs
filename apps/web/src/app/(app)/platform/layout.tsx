import { GeneratedValue } from '@/i18n/generated'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPlatformOperator } from '@/lib/auth'

// This is an explicit platform-only boundary. Tenant pages may use a selected
// tenant context, but control-centre operations never rely on it for authority.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const operator = await getPlatformOperator()
  if (!operator) redirect('/admin')
  const tGenerated = await getGeneratedTranslations()
  const platformNavigation = [
    { href: '/platform', label: tGenerated('m_0c7e907b633729') },
    { href: '/platform/tenants', label: tGenerated('m_0aa9c6e874b978') },
    { href: '/platform/users', label: tGenerated('m_05a23a68b6314c') },
    { href: '/platform/email', label: tGenerated('m_1ed5f249bf011f') },
    { href: '/platform/branding', label: tGenerated('m_009d942e2e5b0f') },
    { href: '/platform/database', label: tGenerated('m_0e10314d04168a') },
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
                  {tGenerated('m_0e30592f5b79aa')}
                </Link>
                <span className="text-xs font-medium text-violet-800 dark:text-violet-200">
                  {tGenerated('m_1032059f7b04bd')}
                </span>
              </div>
              <nav
                aria-label={tGenerated('m_12d1a0e90b20a6')}
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
