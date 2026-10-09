import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { count, isNull } from 'drizzle-orm'
import { Building2, Home, Users, Box, FileText } from 'lucide-react'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants, hospitalityProperties, users, formTemplates } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'

export async function PlatformOverview() {
  const tVisual = await getGeneratedValueTranslations()

  await requirePlatformOperator()
  const totals = await withSuperAdmin(db, async (tx) => {
    const result = await Promise.all([
      tx.select({ value: count() }).from(tenants),
      tx
        .select({ value: count() })
        .from(hospitalityProperties)
        .where(isNull(hospitalityProperties.deletedAt)),
      tx.select({ value: count() }).from(users),
      tx.select({ value: count() }).from(formTemplates).where(isNull(formTemplates.deletedAt)),
    ])
    return result.map((rows) => rows[0]?.value ?? 0)
  })
  const metrics = [
    {
      label: 'Tenants',
      value: totals[0],
      detail: 'All tenant lifecycle states',
      icon: Building2,
      colour: 'text-blue-600 bg-blue-50',
      href: '/platform/tenants',
    },
    {
      label: 'Properties',
      value: totals[1],
      detail: 'Active records across tenants',
      icon: Home,
      colour: 'text-emerald-600 bg-emerald-50',
      href: '/platform/tenants',
    },
    {
      label: 'Platform Users',
      value: totals[2],
      detail: 'Registered global identities',
      icon: Users,
      colour: 'text-blue-600 bg-blue-50',
      href: '/platform/users',
    },
    {
      label: 'Modules',
      value: MODULE_CATALOGUE.length,
      detail: 'Available entitlement types',
      icon: Box,
      colour: 'text-purple-600 bg-purple-50',
      href: '/platform/modules',
    },
    {
      label: 'Templates',
      value: totals[3],
      detail: 'Non-deleted tenant templates',
      icon: FileText,
      colour: 'text-red-500 bg-red-50',
      href: null,
    },
  ]
  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-[34px] leading-tight font-bold tracking-tight text-[#101b55]">
          {tVisual('Platform Admin')}
        </h1>
        <p className="text-sm text-[#546f9c]">
          {tVisual('Manage tenants, users, templates, configuration and platform settings.')}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {metrics.map(({ label, value, detail, icon: Icon, colour, href }) => {
          const content = (
            <>
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${colour}`}>
                <Icon size={30} />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-[#546f9c]">{tVisual(label)}</p>
                <p className="mt-1 text-3xl font-bold text-[#101b55]">{value}</p>
                <p className="mt-1 text-xs text-[#546f9c]">{tVisual(detail)}</p>
              </div>
            </>
          )
          const className = 'flex gap-4 rounded-lg border border-blue-100 bg-white p-4'
          return href ? (
            <Link href={href as never} key={label} className={`${className} hover:border-blue-400`}>
              {content}
            </Link>
          ) : (
            <div key={label} className={className}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
