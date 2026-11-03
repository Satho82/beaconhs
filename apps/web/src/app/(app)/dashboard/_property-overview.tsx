import Link from 'next/link'
import { and, count, eq, isNull, notInArray } from 'drizzle-orm'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssues,
} from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { hospitalityPropertyWhere } from '@/lib/hospitality/property-access'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { listMetering } from '@/lib/hospitality/metering'
import type { ModuleKey } from '@/lib/module-entitlements/catalogue'
import type { DashboardMetrics } from './_metrics'
import { overviewAccess } from './_overview-access'

/** A scoped overview. The existing dashboard below remains available for custom cards. */
export async function PropertyOverview({
  ctx,
  data,
  modules,
}: {
  ctx: RequestContext
  data: DashboardMetrics
  modules: ReadonlySet<ModuleKey>
}) {
  const t = await getGeneratedValueTranslations()
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  const propertyIds = propertyContext.activePropertyId
    ? [propertyContext.activePropertyId]
    : propertyContext.properties.map((property) => property.id)
  const access = overviewAccess(ctx, modules)
  const [maintenance, metering] = await Promise.all([
    access.maintenance
      ? ctx.db(async (tx) => {
          const [row] = await tx
            .select({ value: count() })
            .from(maintenanceIssues)
            .innerJoin(
              hospitalityRooms,
              and(
                eq(hospitalityRooms.tenantId, maintenanceIssues.tenantId),
                eq(hospitalityRooms.id, maintenanceIssues.roomId),
              ),
            )
            .innerJoin(
              hospitalityFloors,
              and(
                eq(hospitalityFloors.tenantId, hospitalityRooms.tenantId),
                eq(hospitalityFloors.id, hospitalityRooms.floorId),
              ),
            )
            .innerJoin(
              hospitalityBuildings,
              and(
                eq(hospitalityBuildings.tenantId, hospitalityFloors.tenantId),
                eq(hospitalityBuildings.id, hospitalityFloors.buildingId),
              ),
            )
            .innerJoin(
              hospitalityProperties,
              and(
                eq(hospitalityProperties.tenantId, hospitalityBuildings.tenantId),
                eq(hospitalityProperties.id, hospitalityBuildings.propertyId),
              ),
            )
            .where(
              and(
                eq(maintenanceIssues.tenantId, ctx.tenantId),
                isNull(hospitalityRooms.deletedAt),
                isNull(hospitalityFloors.deletedAt),
                isNull(hospitalityBuildings.deletedAt),
                isNull(hospitalityProperties.deletedAt),
                hospitalityPropertyWhere(ctx, hospitalityProperties.id),
                propertyContext.activePropertyId
                  ? eq(hospitalityProperties.id, propertyContext.activePropertyId)
                  : undefined,
                notInArray(maintenanceIssues.status, ['completed', 'closed', 'cancelled']),
              ),
            )
          return row?.value ?? 0
        })
      : null,
    access.metering ? listMetering(ctx, { propertyIds }) : null,
  ])
  const cards = [
    access.actions && {
      label: t('Action plans due or overdue'),
      value: data.overdueCAs,
      href: '/corrective-actions',
    },
    maintenance !== null && {
      label: t('Open maintenance'),
      value: maintenance,
      href: '/hospitality/maintenance',
    },
    access.actions && {
      label: t('Open action plans'),
      value: data.openCAs,
      href: '/corrective-actions',
    },
    access.training && {
      label: t('Training expiring in 90 days'),
      value: data.expiringCertsCount,
      href: '/training',
    },
  ].filter((card) => card !== false)
  const latest = new Map<string, NonNullable<typeof metering>['readings'][number]>()
  for (const reading of metering?.readings ?? [])
    if (!latest.has(reading.meterId)) latest.set(reading.meterId, reading)

  return (
    <section aria-label={t('Property overview')} className="space-y-4">
      {cards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="uv-surface block p-5 hover:shadow-md"
            >
              <span className="text-sm text-slate-600 dark:text-slate-300">{card.label}</span>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</div>
            </Link>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {access.actions && (
          <div className="uv-surface p-5">
            <h2 className="text-base font-semibold">{t('Needs your attention')}</h2>
            {data.topOverdueCAs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {t('No overdue action plans.')}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">
                {data.topOverdueCAs.slice(0, 5).map((action) => (
                  <li key={action.id} className="py-2 text-sm">
                    <Link
                      className="font-medium underline"
                      href={`/corrective-actions/${action.id}`}
                    >
                      {action.title}
                    </Link>
                    <span className="ml-2 text-slate-600 dark:text-slate-300">
                      {action.reference} · {action.dueOn}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {metering && (
          <div className="uv-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{t('Metering')}</h2>
              <Link className="text-sm underline" href="/hospitality/metering">
                {t('View metering')}
              </Link>
            </div>
            {metering.meters.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {t('No meters configured for the selected properties.')}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700">
                {metering.meters.slice(0, 5).map((meter) => {
                  const reading = latest.get(meter.id)
                  return (
                    <li
                      key={meter.id}
                      className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                    >
                      <span>
                        {meter.name} {propertyIds.length > 1 ? `· ${meter.propertyName}` : ''}
                      </span>
                      <span>
                        {reading
                          ? `${reading.readingValue} ${meter.measurementUnit}`
                          : t('No readings')}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
