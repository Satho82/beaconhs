import { getGeneratedTranslations } from '@/i18n/generated.server'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { PageContainer } from '@/components/page-layout'
import { PropertyBreadcrumbs } from '@/components/hospitality/property-breadcrumbs'
import { isUuid, parseListParams } from '@/lib/list-params'
import { and, asc, count, eq, ilike, isNull, or } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button, EmptyState, Input, Label, PageHeader } from '@beaconhs/ui'
import { hospitalityBuildings, hospitalityFloors, hospitalityProperties } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan } from '@beaconhs/tenant'
import { can } from '@beaconhs/tenant'
import { createFloorAction, updateBuildingAction } from '../../../actions'
export default async function BuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string; buildingId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId, buildingId } = await params
  if (!isUuid(propertyId) || !isUuid(buildingId)) notFound()
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.read')
  assertCanAccessProperty(ctx, propertyId)
  const search = await searchParams
  const list = parseListParams(search, { sort: 'name', dir: 'asc', allowedSorts: ['name'] })
  const basePath = `/hospitality/properties/${propertyId}/buildings/${buildingId}`
  const floorWhere = and(
    eq(hospitalityFloors.tenantId, ctx.tenantId),
    eq(hospitalityFloors.buildingId, buildingId),
    isNull(hospitalityFloors.deletedAt),
    list.q
      ? or(
          ilike(hospitalityFloors.name, `%${list.q}%`),
          ilike(hospitalityFloors.code, `%${list.q}%`),
        )
      : undefined,
  )
  const d = await ctx.db(async (tx) => {
    const [property] = await tx
      .select()
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          eq(hospitalityProperties.id, propertyId),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1)
    const [building] = property
      ? await tx
          .select()
          .from(hospitalityBuildings)
          .where(
            and(
              eq(hospitalityBuildings.tenantId, ctx.tenantId),
              eq(hospitalityBuildings.id, buildingId),
              eq(hospitalityBuildings.propertyId, propertyId),
              isNull(hospitalityBuildings.deletedAt),
            ),
          )
          .limit(1)
      : []
    const floors = building
      ? await tx
          .select()
          .from(hospitalityFloors)
          .where(floorWhere)
          .orderBy(asc(hospitalityFloors.name), asc(hospitalityFloors.id))
          .limit(list.perPage)
          .offset((list.page - 1) * list.perPage)
      : []
    const [total] = building
      ? await tx.select({ value: count() }).from(hospitalityFloors).where(floorWhere)
      : []
    return { property, building, floors, total: total?.value ?? 0 }
  })
  if (!d.building) notFound()
  const manage = can(ctx, 'hospitality.manage')
  return (
    <PageContainer>
      <PropertyBreadcrumbs
        propertyId={propertyId}
        propertyName={d.property?.name}
        current={d.building.name}
      />
      <PageHeader
        title={d.building.name}
        description={`${d.property?.name} · ${d.building.code}`}
      />
      {manage && (
        <>
          <form
            action={updateBuildingAction}
            className="my-4 grid gap-2 rounded border p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="buildingId" value={buildingId} />
            <Label>
              {translateHospitality('m_02b18d5c7f6f2d')}
              <Input name="name" defaultValue={d.building.name} required />
            </Label>
            <Label>
              {translateHospitality('m_0570e24c85cf95')}
              <Input name="code" defaultValue={d.building.code} required />
            </Label>
            <Button type="submit">{translateHospitality('m_1ab9025ed1067c')}</Button>
          </form>
          <form
            action={createFloorAction}
            className="my-4 grid gap-2 rounded border p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="buildingId" value={buildingId} />
            <Label>
              {translateHospitality('m_1750c09659c9b8')}
              <Input name="name" required />
            </Label>
            <Label>
              {translateHospitality('m_0570e24c85cf95')}
              <Input name="code" required />
            </Label>
            <Button type="submit">{translateHospitality('m_0d2574ef804404')}</Button>
          </form>
        </>
      )}
      <div className="my-4">
        <SearchInput />
      </div>
      {d.floors.length ? (
        d.floors.map((f) => (
          <Link
            className="mb-2 block rounded-lg border p-3 break-words hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2"
            href={`/hospitality/properties/${propertyId}/buildings/${buildingId}/floors/${f.id}`}
            key={f.id}
          >
            <strong>{f.name}</strong>
            <p className="text-muted-foreground text-sm">{f.code}</p>
          </Link>
        ))
      ) : (
        <EmptyState
          title={translateHospitality(
            list.q || d.total > 0 ? 'm_0c726da8b78d42' : 'm_1e51098a8c5d40',
          )}
          description={list.q || d.total > 0 ? undefined : translateHospitality('m_0c9a6639aa5683')}
        />
      )}
      <Pagination
        basePath={basePath}
        currentParams={search}
        total={d.total}
        page={list.page}
        perPage={list.perPage}
      />
    </PageContainer>
  )
}
