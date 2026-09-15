import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button, EmptyState, Input, Label, PageHeader } from '@beaconhs/ui'
import { hospitalityBuildings, hospitalityFloors, hospitalityProperties } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan } from '@beaconhs/tenant'
import { can } from '@beaconhs/tenant'
import { createFloorAction, updateBuildingAction } from '../../../actions'
export default async function BuildingPage({
  params,
}: {
  params: Promise<{ propertyId: string; buildingId: string }>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId, buildingId } = await params
  if (!isUuid(propertyId) || !isUuid(buildingId)) notFound()
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.read')
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
          .where(
            and(
              eq(hospitalityFloors.tenantId, ctx.tenantId),
              eq(hospitalityFloors.buildingId, buildingId),
              isNull(hospitalityFloors.deletedAt),
            ),
          )
      : []
    return { property, building, floors }
  })
  if (!d.building) notFound()
  const manage = can(ctx, 'hospitality.manage')
  return (
    <main className="mx-auto max-w-5xl p-4">
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
      {d.floors.length ? (
        d.floors.map((f) => (
          <Link
            className="block border p-3"
            href={`/hospitality/properties/${propertyId}/buildings/${buildingId}/floors/${f.id}`}
            key={f.id}
          >
            {f.name}
          </Link>
        ))
      ) : (
        <EmptyState
          title={translateHospitality('m_1e51098a8c5d40')}
          description={translateHospitality('m_0c9a6639aa5683')}
        />
      )}
    </main>
  )
}
