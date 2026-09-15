import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, Input, Label, PageHeader } from '@beaconhs/ui'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssues,
} from '@beaconhs/db/schema'
import Link from 'next/link'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan, can } from '@beaconhs/tenant'
import {
  updateRoomAction,
  reportMaintenanceIssueAction,
} from '@/app/(app)/hospitality/properties/actions'
export default async function RoomPage({
  params,
}: {
  params: Promise<{ propertyId: string; buildingId: string; floorId: string; roomId: string }>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId, buildingId, floorId, roomId } = await params
  const p = { propertyId, buildingId, floorId, roomId }
  if (!isUuid(propertyId) || !isUuid(buildingId) || !isUuid(floorId) || !isUuid(roomId)) notFound()

  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.read')

  const d = await ctx.db(async (tx) => {
    const [result] = await tx
      .select({ room: hospitalityRooms })
      .from(hospitalityRooms)
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
          isNull(hospitalityProperties.deletedAt),
          eq(hospitalityRooms.tenantId, ctx.tenantId),
          eq(hospitalityRooms.id, p.roomId),
          eq(hospitalityRooms.floorId, p.floorId),
          isNull(hospitalityRooms.deletedAt),
          eq(hospitalityBuildings.id, p.buildingId),
          eq(hospitalityBuildings.propertyId, p.propertyId),
          isNull(hospitalityFloors.deletedAt),
          isNull(hospitalityBuildings.deletedAt),
        ),
      )
      .limit(1)
    const row = result?.room
    return {
      row,
      issues: row
        ? await tx
            .select()
            .from(maintenanceIssues)
            .where(
              and(
                eq(maintenanceIssues.tenantId, ctx.tenantId),
                eq(maintenanceIssues.roomId, p.roomId),
              ),
            )
        : [],
    }
  })
  if (!d.row) notFound()
  const row = d.row
  return (
    <main className="mx-auto max-w-5xl p-4">
      <PageHeader
        title={row.name || row.code}
        description={`${row.roomType ?? 'room'} · ${row.status}`}
      />
      {can(ctx, 'hospitality.manage') && (
        <>
          <form
            action={updateRoomAction}
            className="my-4 grid gap-2 rounded border p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="propertyId" value={p.propertyId} />
            <input type="hidden" name="buildingId" value={p.buildingId} />
            <input type="hidden" name="floorId" value={p.floorId} />
            <input type="hidden" name="roomId" value={p.roomId} />
            <Label>
              {' '}
              {translateHospitality('m_0eb8e31d1f4abb')}{' '}
              <Input name="code" defaultValue={row.code} required />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_02b18d5c7f6f2d')}{' '}
              <Input name="name" defaultValue={row.name ?? ''} />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_074ba2f160c506')}{' '}
              <Input name="roomType" defaultValue={row.roomType ?? ''} />
            </Label>
            <Button type="submit">{translateHospitality('m_1ab9025ed1067c')}</Button>
          </form>
          <form action={reportMaintenanceIssueAction} className="grid gap-2 rounded border p-3">
            <input type="hidden" name="roomId" value={p.roomId} />
            <Label>
              {' '}
              {translateHospitality('m_06ea0a48c6d042')} <Input name="title" required />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_14d923495cf14c')} <Input name="description" />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_00f0e2904a371c')}{' '}
              <Input name="priority" defaultValue="medium" required />
            </Label>
            <Button type="submit">{translateHospitality('m_1ae7759d0d5257')}</Button>
          </form>
        </>
      )}
      <section className="mt-4">
        {d.issues.map((i) => (
          <Link className="block border p-3" href={`/hospitality/maintenance/${i.id}`} key={i.id}>
            {i.summary} · {i.priority} · {i.status}
          </Link>
        ))}
      </section>
    </main>
  )
}
