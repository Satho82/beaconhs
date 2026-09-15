import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import Link from 'next/link'
import { EmptyState, PageHeader } from '@beaconhs/ui'
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
import { assertCan } from '@beaconhs/tenant'

const BASE = '/hospitality/maintenance'

export default async function MaintenanceQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const translateValue = await getGeneratedValueTranslations()
  const ctx = await requireRequestContext()
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
  return (
    <PageContainer>
      <PageHeader
        title={translateValue('Maintenance queue')}
        description={translateValue('Guest and staff issues across active hotel rooms.')}
      />
      <TableToolbar className="mt-4">
        <SearchInput placeholder={translateValue('Search reference, issue, room or property…')} />
        <FilterChips
          basePath={BASE}
          currentParams={search}
          paramKey="status"
          label={translateValue('Status')}
          options={MAINTENANCE_STATUSES.map((value) => ({
            value,
            label: value.replaceAll('_', ' '),
          }))}
        />
      </TableToolbar>
      {data.rows.length === 0 ? (
        <EmptyState title={translateValue('No maintenance issues found')} />
      ) : (
        <div className="mt-4 grid gap-3">
          {data.rows.map(({ issue, roomCode, roomName, propertyName }) => (
            <Link
              key={issue.id}
              href={`/hospitality/maintenance/${issue.id}`}
              className="hover:bg-muted/40 rounded-lg border p-4 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong>
                  {issue.reference} · {issue.summary}
                </strong>
                <span className="rounded-full border px-2 py-0.5 text-xs">
                  {issue.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {propertyName} · {translateValue('Room')} {roomName || roomCode} · {issue.priority}{' '}
                · {issue.source}
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
