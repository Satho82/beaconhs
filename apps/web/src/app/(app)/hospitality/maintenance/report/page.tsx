import { and, asc, eq, isNull } from 'drizzle-orm'
import { PageHeader } from '@beaconhs/ui'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
} from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { hospitalityPropertyWhere } from '@/lib/hospitality/property-access'
import { resolveHospitalityPropertyContext } from '@/lib/hospitality/property-context'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan } from '@beaconhs/tenant'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'
import { QuickMaintenanceForm } from './quick-maintenance-form'

export default async function ReportMaintenancePage() {
  const t = await getGeneratedValueTranslations()
  const ctx = await requireRequestContext()
  const propertyContext = await resolveHospitalityPropertyContext(ctx)
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, 'maintenance.create')

  const data = await ctx.db(async (tx) => {
    const propertyScope = hospitalityPropertyWhere(ctx, hospitalityProperties.id)
    const properties = await tx
      .select({ id: hospitalityProperties.id, name: hospitalityProperties.name })
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          isNull(hospitalityProperties.deletedAt),
          propertyScope,
          propertyContext.activePropertyId
            ? eq(hospitalityProperties.id, propertyContext.activePropertyId)
            : undefined,
        ),
      )
      .orderBy(asc(hospitalityProperties.name))
    const rooms = await tx
      .select({
        id: hospitalityRooms.id,
        propertyId: hospitalityProperties.id,
        propertyName: hospitalityProperties.name,
        roomCode: hospitalityRooms.code,
        roomName: hospitalityRooms.name,
      })
      .from(hospitalityRooms)
      .innerJoin(
        hospitalityFloors,
        and(
          eq(hospitalityFloors.tenantId, hospitalityRooms.tenantId),
          eq(hospitalityFloors.id, hospitalityRooms.floorId),
          isNull(hospitalityFloors.deletedAt),
        ),
      )
      .innerJoin(
        hospitalityBuildings,
        and(
          eq(hospitalityBuildings.tenantId, hospitalityFloors.tenantId),
          eq(hospitalityBuildings.id, hospitalityFloors.buildingId),
          isNull(hospitalityBuildings.deletedAt),
        ),
      )
      .innerJoin(
        hospitalityProperties,
        and(
          eq(hospitalityProperties.tenantId, hospitalityBuildings.tenantId),
          eq(hospitalityProperties.id, hospitalityBuildings.propertyId),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .where(
        and(
          eq(hospitalityRooms.tenantId, ctx.tenantId),
          isNull(hospitalityRooms.deletedAt),
          propertyScope,
          propertyContext.activePropertyId
            ? eq(hospitalityProperties.id, propertyContext.activePropertyId)
            : undefined,
        ),
      )
      .orderBy(asc(hospitalityProperties.name), asc(hospitalityRooms.code))
    return { properties, rooms }
  })

  return (
    <PageContainer>
      <PageHeader
        title={t('Report maintenance issue')}
        description={t(
          'Tell Engineering what is broken. Assignment and work-order details can be added later.',
        )}
      />
      <QuickMaintenanceForm
        properties={data.properties}
        rooms={data.rooms.map((room) => ({
          id: room.id,
          propertyId: room.propertyId,
          label: room.roomName || `${t('Room')} ${room.roomCode}`,
        }))}
      />
    </PageContainer>
  )
}
