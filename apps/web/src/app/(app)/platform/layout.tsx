import { GeneratedValue } from '@/i18n/generated'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPlatformOperator } from '@/lib/auth'

const PLATFORM_NAVIGATION = [
  { href: '/platform', label: 'Dashboard' },
  { href: '/platform/tenants', label: 'Management companies' },
  { href: '/platform/users', label: 'Platform users' },
  { href: '/platform/email', label: 'Communications' },
  { href: '/platform/branding', label: 'Branding' },
  { href: '/platform/database', label: 'System health' },
]

// This is an explicit platform-only boundary. Tenant pages may use a selected
// tenant context, but control-centre operations never rely on it for authority.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const operator = await getPlatformOperator()
  if (!operator) redirect('/admin')

  return (
    <GeneratedValue
      value={
        <div className="min-h-full">
          <header className="border-b border-violet-300 bg-violet-50 px-4 py-2 dark:border-violet-800/60 dark:bg-violet-950/40 sm:px-6">
            <div className="mx-auto max-w-[1600px] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/platform"
                  className="text-sm font-semibold tracking-wide text-violet-950 dark:text-violet-100"
                >
                  Uvanoo Platform Control Centre
                </Link>
                <span className="text-xs font-medium text-violet-800 dark:text-violet-200">
                  Platform context · tenant and property scope do not grant platform authority
                </span>
              </div>
              <nav aria-label="Platform navigation" className="flex flex-wrap gap-3 text-sm">
                {PLATFORM_NAVIGATION.map((item) => (
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
