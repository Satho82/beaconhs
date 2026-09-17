import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { Button, DetailHeader } from '@beaconhs/ui'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  qrTargets,
} from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { requireRequestContext } from '@/lib/auth'
import { assertCanAccessProperty } from '@/lib/hospitality/property-access'
import { isUuid } from '@/lib/list-params'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { guestMaintenanceUrl } from '@/lib/hospitality/room-qr'
import { assertCan } from '@beaconhs/tenant'

export const dynamic = 'force-dynamic'

export default async function RoomQrPage({
  params,
}: {
  params: Promise<{ propertyId: string; buildingId: string; floorId: string; roomId: string }>
}) {
  const translateValue = await getGeneratedValueTranslations()
  const { propertyId, buildingId, floorId, roomId } = await params
  const p = { propertyId, buildingId, floorId, roomId }
  if (!isUuid(propertyId) || !isUuid(buildingId) || !isUuid(floorId) || !isUuid(roomId)) notFound()
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, 'hospitality.read')
  assertCanAccessProperty(ctx, propertyId)
  const row = await ctx.db(async (tx) => {
    const [result] = await tx
      .select({
        roomCode: hospitalityRooms.code,
        roomName: hospitalityRooms.name,
        propertyName: hospitalityProperties.name,
        token: qrTargets.token,
      })
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
      .innerJoin(
        qrTargets,
        and(
          eq(qrTargets.tenantId, hospitalityRooms.tenantId),
          eq(qrTargets.roomId, hospitalityRooms.id),
          eq(qrTargets.isActive, true),
        ),
      )
      .where(
        and(
          eq(hospitalityRooms.tenantId, ctx.tenantId),
          eq(hospitalityRooms.id, p.roomId),
          eq(hospitalityRooms.floorId, p.floorId),
          eq(hospitalityFloors.id, p.floorId),
          eq(hospitalityFloors.buildingId, p.buildingId),
          eq(hospitalityBuildings.id, p.buildingId),
          eq(hospitalityBuildings.propertyId, p.propertyId),
          eq(hospitalityProperties.id, p.propertyId),
          isNull(hospitalityRooms.deletedAt),
          isNull(hospitalityFloors.deletedAt),
          isNull(hospitalityBuildings.deletedAt),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .limit(1)
    return result ?? null
  })
  if (!row) notFound()
  const url = guestMaintenanceUrl(row.token)
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    width: 420,
    color: { dark: '#062A39', light: '#ffffff' },
  })
  const back = `/hospitality/properties/${p.propertyId}/buildings/${p.buildingId}/floors/${p.floorId}/rooms/${p.roomId}`
  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-5">
        <DetailHeader
          back={{ href: back, label: translateValue('Back to room') }}
          title={[
            translateValue('Room'),
            row.roomName || row.roomCode,
            translateValue('guest QR'),
          ].join(' ')}
          subtitle={row.propertyName}
          actions={
            <Button asChild variant="outline">
              <Link href={url} target="_blank" rel="noopener noreferrer">
                {translateValue('Open guest form')}
              </Link>
            </Button>
          }
        />
        <section className="rounded-xl border bg-white p-6 text-center text-slate-950 print:border-0 print:shadow-none">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#0b6978] uppercase">
            {translateValue('Uvanoo Guest Services')}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{translateValue('Need something fixed?')}</h1>
          <p className="mt-2">
            {translateValue('Scan to report a maintenance issue from this room.')}
          </p>
          <div
            className="mx-auto mt-5 w-full max-w-sm [&_svg]:h-auto [&_svg]:w-full"
            aria-label={[translateValue('Maintenance reporting QR for room'), row.roomCode].join(
              ' ',
            )}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="mt-4 text-xl font-semibold">
            {translateValue('Room')} {row.roomName || row.roomCode}
          </p>
          <p className="mt-1 text-sm text-slate-600">{row.propertyName}</p>
        </section>
      </div>
    </PageContainer>
  )
}
