'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@beaconhs/ui'
export function PlatformTenantTabs({
  tenantId,
  tenantName,
}: {
  tenantId: string
  tenantName: string
}) {
  const path = usePathname()
  const base = `/platform/tenants/${tenantId}`
  const tabs = [
    ['Overview', ''],
    ['Modules', '/entitlements'],
    ['Branding', '/branding'],
    ['Properties', '/properties'],
    ['Activity', '/audit'],
  ]
  return (
    <div className="shrink-0 border-b bg-white px-4 pt-3 sm:px-6 dark:bg-slate-900">
      <p className="text-xs font-medium break-words text-slate-500">
        Platform administration ·{' '}
        <span className="text-slate-900 dark:text-slate-100">{tenantName}</span>
      </p>
      <nav aria-label="Tenant administration" className="mt-2 flex gap-2 overflow-x-auto">
        {tabs.map(([label, suffix]) => (
          <Link
            key={label}
            href={`${base}${suffix}` as never}
            aria-current={path === `${base}${suffix}` ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-600',
              path === `${base}${suffix}`
                ? 'border-teal-700 font-semibold text-teal-700'
                : 'border-transparent text-slate-500 hover:text-teal-700',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
