import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, Input, Label, PageHeader } from '@beaconhs/ui'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssues,
  qrTargets,
} from '@beaconhs/db/schema'
import Link from 'next/link'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled, loadEnabledModuleKeys } from '@/lib/module-entitlements/server'
import { assertCan, can } from '@beaconhs/tenant'
import {
  updateRoomAction,
  reportMaintenanceIssueAction,
  provisionRoomQrAction,
  rotateRoomQrAction,
} from '@/app/(app)/hospitality/properties/actions'
export default async function RoomPage({
  params,
}: {
  params: Promise<{ propertyId: string; buildingId: string; floorId: string; roomId: string }>
}) {
  const [translateHospitality, translateValue] = await Promise.all([
    getGeneratedTranslations(),
    getGeneratedValueTranslations(),
  ])

  const { propertyId, buildingId, floorId, roomId } = await params
  const p = { propertyId, buildingId, floorId, roomId }
  if (!isUuid(propertyId) || !isUuid(buildingId) || !isUuid(floorId) || !isUuid(roomId)) notFound()

  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.read')
  const modules = await loadEnabledModuleKeys(ctx)
  const maintenanceEnabled = modules.has('hospitality.maintenance')

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
    const qr =
      row && maintenanceEnabled
        ? await tx
            .select()
            .from(qrTargets)
            .where(and(eq(qrTargets.tenantId, ctx.tenantId), eq(qrTargets.roomId, p.roomId)))
            .limit(1)
        : []
    return {
      row,
      qr: qr[0] ?? null,
      issues:
        row && maintenanceEnabled
          ? await tx
              .select()
              .from(maintenanceIssues)
              .where(
                and(
                  eq(maintenanceIssues.tenantId, ctx.tenantId),
                  eq(maintenanceIssues.roomId, p.roomId),
                ),
              )
              .orderBy(desc(maintenanceIssues.createdAt), desc(maintenanceIssues.id))
              .limit(10)
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
          {maintenanceEnabled && (
            <section className="mb-4 rounded border p-3">
              <h2 className="font-semibold">{translateValue('Guest maintenance QR')}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {translateValue('The code opens a mobile guest form already linked to this room.')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {d.qr?.isActive ? (
                  <>
                    <Button asChild variant="outline">
                      <Link
                        href={`/hospitality/properties/${p.propertyId}/buildings/${p.buildingId}/floors/${p.floorId}/rooms/${p.roomId}/qr`}
                      >
                        {translateValue('View and print QR')}
                      </Link>
                    </Button>
                    <form action={rotateRoomQrAction}>
                      {Object.entries(p).map(([name, value]) => (
                        <input key={name} type="hidden" name={name} value={value} />
                      ))}
                      <Button type="submit" variant="outline">
                        {translateValue('Rotate QR')}
                      </Button>
                    </form>
                  </>
                ) : (
                  <form action={provisionRoomQrAction}>
                    {Object.entries(p).map(([name, value]) => (
                      <input key={name} type="hidden" name={name} value={value} />
                    ))}
                    <Button type="submit">{translateValue('Create room QR')}</Button>
                  </form>
                )}
              </div>
            </section>
          )}
          {maintenanceEnabled && (
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
          )}
        </>
      )}
      {maintenanceEnabled && (
        <section className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{translateValue('Recent maintenance issues')}</h2>
            <Link href="/hospitality/maintenance" className="text-sm underline">
              {translateValue('View all')}
            </Link>
          </div>
          {d.issues.length === 0 ? (
            <p className="text-muted-foreground rounded border p-3 text-sm">
              {translateValue('No issues reported.')}
            </p>
          ) : (
            <div className="grid gap-2">
              {d.issues.map((i) => (
                <Link
                  className="rounded border p-3"
                  href={`/hospitality/maintenance/${i.id}`}
                  key={i.id}
                >
                  {i.reference} · {i.summary} · {i.priority} · {i.status}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
