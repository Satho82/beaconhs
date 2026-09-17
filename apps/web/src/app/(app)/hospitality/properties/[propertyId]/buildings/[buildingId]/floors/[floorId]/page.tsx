import { SearchInput } from '@/components/search-input'
import { FilterChips } from '@/components/filter-bar'
import { Pagination } from '@/components/pagination'
import { getGeneratedValueTranslations, getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid, parseListParams, pickString } from '@/lib/list-params'
import { and, asc, count, eq, ilike, isNull, or } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button, EmptyState, Input, Label, PageHeader } from '@beaconhs/ui'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
} from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan } from '@beaconhs/tenant'
import { can } from '@beaconhs/tenant'
import { createRoomAction, updateFloorAction } from '../../../../../actions'
export default async function FloorPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string; buildingId: string; floorId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId, buildingId, floorId } = await params
  if (!isUuid(propertyId) || !isUuid(buildingId) || !isUuid(floorId)) notFound()
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.read')
  assertCanAccessProperty(ctx, propertyId)
  const translateValue = await getGeneratedValueTranslations()
  const search = await searchParams
  const list = parseListParams(search, { sort: 'code', dir: 'asc', allowedSorts: ['code'] })
  const rawStatus = pickString(search.status)
  const status = hospitalityRooms.status.enumValues.find((value) => value === rawStatus)
  const statusLabels = {
    available: 'Available',
    occupied: 'Occupied',
    out_of_service: 'Out of service',
    maintenance: 'Maintenance',
    blocked: 'Blocked',
  } satisfies Record<(typeof hospitalityRooms.status.enumValues)[number], string>
  const basePath = `/hospitality/properties/${propertyId}/buildings/${buildingId}/floors/${floorId}`
  const currentParams = { ...search, status }
  const roomWhere = and(
    eq(hospitalityRooms.tenantId, ctx.tenantId),
    eq(hospitalityRooms.floorId, floorId),
    isNull(hospitalityRooms.deletedAt),
    status ? eq(hospitalityRooms.status, status) : undefined,
    list.q
      ? or(
          ilike(hospitalityRooms.code, `%${list.q}%`),
          ilike(hospitalityRooms.name, `%${list.q}%`),
          ilike(hospitalityRooms.roomType, `%${list.q}%`),
        )
      : undefined,
  )
  const d = await ctx.db(async (tx) => {
    const [result] = await tx
      .select({ floor: hospitalityFloors })
      .from(hospitalityFloors)
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
          isNull(hospitalityProperties.deletedAt),
          eq(hospitalityFloors.tenantId, ctx.tenantId),
          eq(hospitalityFloors.id, floorId),
          eq(hospitalityFloors.buildingId, buildingId),
          isNull(hospitalityFloors.deletedAt),
          eq(hospitalityBuildings.propertyId, propertyId),
          isNull(hospitalityBuildings.deletedAt),
        ),
      )
      .limit(1)
    const floor = result?.floor
    const [total] = floor
      ? await tx.select({ value: count() }).from(hospitalityRooms).where(roomWhere)
      : []
    return {
      floor,
      total: total?.value ?? 0,
      rooms: floor
        ? await tx
            .select()
            .from(hospitalityRooms)
            .where(roomWhere)
            .orderBy(asc(hospitalityRooms.code), asc(hospitalityRooms.id))
            .limit(list.perPage)
            .offset((list.page - 1) * list.perPage)
        : [],
    }
  })
  if (!d.floor) notFound()
  const manage = can(ctx, 'hospitality.manage')
  return (
    <main className="mx-auto max-w-5xl p-4">
      <PageHeader title={d.floor.name} description={d.floor.code} />
      {manage && (
        <>
          <form
            action={updateFloorAction}
            className="my-4 grid gap-2 rounded border p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="buildingId" value={buildingId} />
            <input type="hidden" name="floorId" value={floorId} />
            <Label>
              {translateHospitality('m_02b18d5c7f6f2d')}
              <Input name="name" defaultValue={d.floor.name} required />
            </Label>
            <Label>
              {translateHospitality('m_0570e24c85cf95')}
              <Input name="code" defaultValue={d.floor.code} required />
            </Label>
            <Button type="submit">{translateHospitality('m_1ab9025ed1067c')}</Button>
          </form>
          <form
            action={createRoomAction}
            className="my-4 grid gap-2 rounded border p-3 sm:grid-cols-4"
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="buildingId" value={buildingId} />
            <input type="hidden" name="floorId" value={floorId} />
            <Label>
              {translateHospitality('m_0eb8e31d1f4abb')}
              <Input name="code" required />
            </Label>
            <Label>
              {translateHospitality('m_02b18d5c7f6f2d')}
              <Input name="name" />
            </Label>
            <Label>
              {translateHospitality('m_074ba2f160c506')}
              <Input name="roomType" placeholder={translateHospitality('m_18296a7b61dadf')} />
            </Label>
            <Button type="submit">{translateHospitality('m_09a43f2299c207')}</Button>
          </form>
        </>
      )}
      <div className="my-4 flex flex-wrap items-center gap-2">
        <SearchInput />
        <FilterChips
          basePath={basePath}
          currentParams={currentParams}
          paramKey="status"
          label={translateValue('Status')}
          options={hospitalityRooms.status.enumValues.map((value) => ({
            value,
            label: translateValue(statusLabels[value]),
          }))}
        />
      </div>
      {d.rooms.length ? (
        d.rooms.map((r) => (
          <Link
            className="block border p-3 break-words"
            href={`/hospitality/properties/${propertyId}/buildings/${buildingId}/floors/${floorId}/rooms/${r.id}`}
            key={r.id}
          >
            <strong>{r.code}</strong>
            {r.name ? ` · ${r.name}` : ''}
            <p className="text-muted-foreground text-sm">
              {r.roomType ?? translateHospitality('m_0f0d867c9f1b5f')} ·{' '}
              {translateValue(statusLabels[r.status])}
            </p>
          </Link>
        ))
      ) : (
        <EmptyState
          title={translateHospitality(
            list.q || status || d.total > 0 ? 'm_0c726da8b78d42' : 'm_1e6c06be7b838f',
          )}
          description={
            list.q || status || d.total > 0 ? undefined : translateHospitality('m_1e51f2e9c75d2e')
          }
        />
      )}
      <Pagination
        basePath={basePath}
        currentParams={currentParams}
        total={d.total}
        page={list.page}
        perPage={list.perPage}
      />
    </main>
  )
}
