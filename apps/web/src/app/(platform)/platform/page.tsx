import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'
import Link from 'next/link'
import { asc, count, desc, eq, isNull } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import {
  tenants,
  users,
  hospitalityProperties,
  formTemplates,
  platformAuditLog,
} from '@beaconhs/db/schema'
import { Button, Badge, EmptyState, PageHeader } from '@beaconhs/ui'
import { PageContainer } from '@/components/page-layout'
import { requirePlatformOperator } from '@/lib/auth'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'
import { getPlatformBranding } from '@/lib/platform-branding-config'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const translateValue = await getGeneratedValueTranslations()
  return { title: translateValue('Platform administration') }
}

export default async function PlatformHubPage() {
  const tBoard = await getGeneratedValueTranslations()
  const tBoardMessage = await getGeneratedTranslations()

  await requirePlatformOperator()
  const [data, branding] = await Promise.all([
    withSuperAdmin(db, async (tx) => {
      const [tenantCount, propertyCount, userCount, templateCount, portfolio, activity, suspended] =
        await Promise.all([
          tx.select({ value: count() }).from(tenants),
          tx
            .select({ value: count() })
            .from(hospitalityProperties)
            .where(isNull(hospitalityProperties.deletedAt)),
          tx.select({ value: count() }).from(users),
          tx.select({ value: count() }).from(formTemplates).where(isNull(formTemplates.deletedAt)),
          tx
            .select({
              id: tenants.id,
              name: tenants.name,
              status: tenants.status,
              region: tenants.region,
            })
            .from(tenants)
            .orderBy(asc(tenants.name), asc(tenants.id))
            .limit(6),
          tx
            .select({
              id: platformAuditLog.id,
              action: platformAuditLog.action,
              summary: platformAuditLog.summary,
              occurredAt: platformAuditLog.occurredAt,
            })
            .from(platformAuditLog)
            .orderBy(desc(platformAuditLog.occurredAt))
            .limit(8),
          tx.select({ value: count() }).from(tenants).where(eq(tenants.status, 'suspended')),
        ])
      return {
        tenantCount: tenantCount[0]?.value ?? 0,
        propertyCount: propertyCount[0]?.value ?? 0,
        userCount: userCount[0]?.value ?? 0,
        templateCount: templateCount[0]?.value ?? 0,
        portfolio,
        activity,
        suspended: suspended[0]?.value ?? 0,
      }
    }),
    getPlatformBranding(),
  ])
  const metrics = [
    {
      label: 'Tenants',
      value: data.tenantCount,
      href: '/platform/tenants',
      detail: 'All lifecycle states',
    },
    {
      label: 'Properties',
      value: data.propertyCount,
      href: '/platform/tenants',
      detail: 'Active property records across tenants',
    },
    {
      label: 'Platform Users',
      value: data.userCount,
      href: '/platform/users',
      detail: 'Global identities, including disabled accounts',
    },
    {
      label: 'Module types',
      value: MODULE_CATALOGUE.length,
      href: '/platform/tenants',
      detail: 'Available entitlement catalogue entries',
    },
    {
      label: 'Tenant form templates',
      value: data.templateCount,
      href: null,
      detail: 'Non-deleted tenant form templates',
    },
  ]
  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title={tBoard('Platform administration')}
          description={tBoard('Manage organisations and platform configuration')}
          actions={
            <Button asChild>
              <Link href="/platform/tenants/new">{tBoard('Create tenant')}</Link>
            </Button>
          }
        />
        <div
          className="grid grid-cols-2 gap-3 xl:grid-cols-5"
          aria-label={tBoard('Platform totals')}
        >
          {metrics.map((metric) => {
            const content = (
              <>
                <p className="text-sm text-slate-500">{tBoard(metric.label)}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{metric.value}</p>
                <p className="mt-2 text-xs text-slate-500">{tBoard(metric.detail)}</p>
              </>
            )
            return metric.href ? (
              <Link
                key={metric.label}
                href={metric.href as never}
                className="rounded-xl border bg-white p-4 hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-teal-600 dark:bg-slate-900"
              >
                {content}
              </Link>
            ) : (
              <div key={metric.label} className="rounded-xl border bg-white p-4 dark:bg-slate-900">
                {content}
              </div>
            )
          })}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section className="min-w-0 rounded-xl border bg-white p-5 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{tBoard('Tenant portfolio')}</h2>
              <Link href="/platform/tenants" className="text-sm text-teal-700 underline">
                {tBoard('Search and view all tenants')}
              </Link>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {tBoardMessage('m_007b9f5efe70ce', {
                value0: data.portfolio.length,
                value1: data.tenantCount,
              })}
            </p>
            {data.portfolio.length ? (
              <ul className="mt-4 divide-y">
                {data.portfolio.map((tenant) => (
                  <li key={tenant.id}>
                    <Link
                      href={`/platform/tenants/${tenant.id}`}
                      className="flex items-center justify-between gap-3 rounded py-4 focus-visible:outline-2 focus-visible:outline-teal-600"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tenant.name}</p>
                        <p className="text-sm text-slate-500">{tenant.region}</p>
                      </div>
                      <Badge variant={tenant.status === 'active' ? 'success' : 'secondary'}>
                        {tBoard(tenant.status)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title={tBoard('No tenants yet')}
                description={tBoard(
                  'Create a tenant to begin configuring its properties and modules.',
                )}
              />
            )}
          </section>
          <div className="space-y-5">
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="font-semibold">{tBoard('Configuration attention')}</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li>
                  <Link
                    href="/platform/tenants?status=suspended"
                    className="text-teal-700 underline"
                  >
                    {tBoardMessage('m_1030f26d75f161', { value0: data.suspended })}
                  </Link>
                </li>
                <li>
                  <Link href="/platform/branding" className="text-teal-700 underline">
                    {branding.logoUrl
                      ? tBoard('Review master identity and branding')
                      : tBoard('Configure your master logo')}
                  </Link>
                </li>
                <li className="text-slate-500">
                  {tBoard(
                    'Module settings are managed for each tenant. Access still depends on role and property permissions.',
                  )}
                </li>
              </ul>
            </section>
            <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
              <h2 className="font-semibold">{tBoard('Recent platform activity')}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {tBoard('Latest eight recorded platform events')}
              </p>
              {data.activity.length ? (
                <ul className="mt-3 space-y-4">
                  {data.activity.map((event) => (
                    <li key={event.id} className="text-sm">
                      <p className="break-words">{tBoard(event.summary ?? event.action)}</p>
                      <time
                        className="text-xs text-slate-500"
                        dateTime={event.occurredAt.toISOString()}
                      >
                        {event.occurredAt.toISOString().replace('T', ' ').slice(0, 16)}{' '}
                        {tBoard('UTC')}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  {tBoard('No platform activity recorded.')}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
