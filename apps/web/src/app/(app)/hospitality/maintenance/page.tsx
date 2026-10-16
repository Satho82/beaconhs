import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import Link from 'next/link'
import { Badge, Button, EmptyState, PageHeader } from '@beaconhs/ui'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssues,
} from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { FilterChips } from '@/components/filter-bar'
import { Pagination } from '@/components/pagination'
import { SearchInput } from '@/components/search-input'
import { TableToolbar } from '@/components/table-toolbar'
import { requireRequestContext } from '@/lib/auth'
import { MAINTENANCE_STATUSES, type MaintenanceStatus } from '@/lib/hospitality/maintenance'
import { parseListParams, pickString } from '@/lib/list-params'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan, can } from '@beaconhs/tenant'
import { hospitalityPropertyWhere } from '@/lib/hospitality/property-access'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'

const BASE = '/hospitality/maintenance'

export default async function MaintenanceQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const translateValue = await getGeneratedValueTranslations()
  const ctx = await requireRequestContext()
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, 'maintenance.read')
  const search = await searchParams
  const params = parseListParams(search, {
    sort: 'created',
    dir: 'desc',
    allowedSorts: ['created'] as const,
  })
  const rawStatus = pickString(search.status)
  const status = MAINTENANCE_STATUSES.includes(rawStatus as MaintenanceStatus)
    ? (rawStatus as MaintenanceStatus)
    : undefined
  const where = and(
    eq(maintenanceIssues.tenantId, ctx.tenantId),
    isNull(hospitalityRooms.deletedAt),
    isNull(hospitalityFloors.deletedAt),
    isNull(hospitalityBuildings.deletedAt),
    isNull(hospitalityProperties.deletedAt),
    hospitalityPropertyWhere(ctx, hospitalityProperties.id),
    propertyContext.activePropertyId
      ? eq(hospitalityProperties.id, propertyContext.activePropertyId)
      : undefined,
    status ? eq(maintenanceIssues.status, status) : undefined,
    params.q
      ? or(
          ilike(maintenanceIssues.reference, `%${params.q}%`),
          ilike(maintenanceIssues.summary, `%${params.q}%`),
          ilike(hospitalityRooms.code, `%${params.q}%`),
          ilike(hospitalityProperties.name, `%${params.q}%`),
        )
      : undefined,
  )
  const data = await ctx.db(async (tx) => {
    const base = tx
      .select({
        issue: maintenanceIssues,
        roomCode: hospitalityRooms.code,
        roomName: hospitalityRooms.name,
        propertyName: hospitalityProperties.name,
      })
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
    const rows = await base
      .where(where)
      .orderBy(desc(maintenanceIssues.createdAt), desc(maintenanceIssues.id))
      .limit(params.perPage)
      .offset((params.page - 1) * params.perPage)
    const [total] = await tx
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
      .where(where)
    return { rows, total: total?.value ?? 0 }
  })
  const activeIssues = data.rows.filter(
    ({ issue }) => issue.status !== 'completed' && issue.status !== 'closed',
  )
  const criticalIssues = data.rows.filter(({ issue }) => issue.priority === 'critical')
  const handoverIssues = data.rows.filter(({ issue }) => issue.source === 'manager')

  return (
    <PageContainer>
      <PageHeader
        title={translateValue('Maintenance queue')}
        description={translateValue('Guest and staff issues across active hotel rooms.')}
        actions={
          can(ctx, 'maintenance.create') ? (
            <Button asChild>
              <Link href="/hospitality/maintenance/report">
                {translateValue('+ Report maintenance issue')}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <section className="mt-5 rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-white p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
              {translateValue('Hotel operations')} · {translateValue('Maintenance control')}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {translateValue('Maintenance overview')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {translateValue('Guest defects, handover-created issues and the active maintenance queue in one accountable workspace.')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className="rounded-lg border border-teal-200 bg-white px-3 py-2 font-semibold text-teal-700" href="/equipment">
              {translateValue('Asset register & PPM')}
            </Link>
            <Link className="rounded-lg border border-teal-200 bg-white px-3 py-2 font-semibold text-teal-700" href="/hospitality/maintenance/report">
              {translateValue('Report issue')}
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-600">{translateValue('All issues')}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{data.total}</p><p className="mt-1 text-xs text-teal-700">{translateValue('Within the current property and search scope')}</p></div>
          <div className="rounded-xl border border-white bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-600">{translateValue('Active in this view')}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{activeIssues.length}</p><p className="mt-1 text-xs text-teal-700">{translateValue('Excludes completed and closed records')}</p></div>
          <div className="rounded-xl border border-white bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-600">{translateValue('Critical')}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{criticalIssues.length}</p><p className="mt-1 text-xs text-rose-700">{translateValue('Requires priority review')}</p></div>
          <div className="rounded-xl border border-white bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-600">{translateValue('Handover linked')}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{handoverIssues.length}</p><p className="mt-1 text-xs text-teal-700">{translateValue('Created from the operational handover')}</p></div>
        </div>
      </section>
      <p className="text-muted-foreground mt-3 text-sm">
        {translateValue('Property')}:{' '}
        {propertyContext.properties.find(
          (property) => property.id === propertyContext.activePropertyId,
        )?.name || translateValue('All accessible properties')}
      </p>
      <TableToolbar className="mt-4">
        <SearchInput placeholder={translateValue('Search reference, issue, room or property…')} />
        <FilterChips
          basePath={BASE}
          currentParams={search}
          paramKey="status"
          label={translateValue('Status')}
          options={MAINTENANCE_STATUSES.map((value) => ({
            value,
            label: translateValue(value.replaceAll('_', ' ')),
          }))}
        />
      </TableToolbar>
      {data.rows.length === 0 ? (
        <EmptyState className="mt-4" title={translateValue('No maintenance issues found')} />
      ) : (
        <div className="mt-4 grid gap-3">
          {data.rows.map(({ issue, roomCode, roomName, propertyName }) => (
            <Link
              key={issue.id}
              href={`/hospitality/maintenance/${issue.id}`}
              className="uv-record-link p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="mb-1 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                    {issue.reference}
                  </p>
                  <strong className="text-base font-semibold">{issue.summary}</strong>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={
                      issue.priority === 'critical'
                        ? 'destructive'
                        : issue.priority === 'high'
                          ? 'warning'
                          : 'outline'
                    }
                  >
                    {translateValue(issue.priority)}
                  </Badge>
                  <Badge
                    variant={
                      issue.status === 'completed' || issue.status === 'closed'
                        ? 'success'
                        : 'secondary'
                    }
                  >
                    {translateValue(issue.status.replaceAll('_', ' '))}
                  </Badge>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                {propertyName} · {roomName || `${translateValue('Room')} ${roomCode}`} ·{' '}
                {translateValue(issue.source.replaceAll('_', ' '))}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Pagination
        basePath={BASE}
        currentParams={search}
        total={data.total}
        page={params.page}
        perPage={params.perPage}
      />
    </PageContainer>
  )
}
