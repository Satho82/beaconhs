import { GeneratedValue } from '@/i18n/generated'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPlatformOperator } from '@/lib/auth'

// This is an explicit platform-only boundary. Tenant pages may use a selected
// tenant context, but control-centre operations never rely on it for authority.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const operator = await getPlatformOperator()
  if (!operator) redirect('/admin')
  return (
    <GeneratedValue
      value={
        <div className="min-h-full">
          <div className="border-b border-violet-300 bg-violet-50 px-4 py-2 dark:border-violet-800/60 dark:bg-violet-950/40 sm:px-6">
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
              <nav
                aria-label="Platform navigation"
                className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium"
              >
                <Link
                  href="/platform"
                  className="text-violet-900 hover:underline dark:text-violet-100"
                >
                  Dashboard
                </Link>
                <Link
                  href="/platform/tenants"
                  className="text-violet-900 hover:underline dark:text-violet-100"
                >
                  Management companies
                </Link>
                <Link
                  href="/platform/users"
                  className="text-violet-900 hover:underline dark:text-violet-100"
                >
                  Platform users
                </Link>
                <Link
                  href="/platform/email"
                  className="text-violet-900 hover:underline dark:text-violet-100"
                >
                  Communications
                </Link>
                <Link
                  href="/platform/branding"
                  className="text-violet-900 hover:underline dark:text-violet-100"
                >
                  Branding
                </Link>
                <Link
                  href="/platform/database"
                  className="text-violet-900 hover:underline dark:text-violet-100"
                >
                  System health
                </Link>
              </nav>
            </div>
          </div>
          {children}
        </div>
      }
    />
  )
}
