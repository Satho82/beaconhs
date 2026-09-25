import { GeneratedValue } from '@/i18n/generated'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRequestContext } from '@/lib/auth'

// This is an explicit platform-only boundary. Tenant pages may use a selected
// tenant context, but control-centre operations never rely on it for authority.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRequestContext()
  if (!ctx.isSuperAdmin) redirect('/admin')
  return (
    <GeneratedValue
      value={
        <div className="min-h-full">
          <div className="border-b border-violet-300 bg-violet-50 px-4 py-2 dark:border-violet-800/60 dark:bg-violet-950/40 sm:px-6">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
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
          </div>
          {children}
        </div>
      }
    />
  )
}
