import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { and, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button, Label, PageHeader, Select } from '@beaconhs/ui'
import {
  hospitalityBuildings,
  hospitalityFloors,
  hospitalityProperties,
  hospitalityRooms,
  maintenanceIssues,
  tenantUsers,
  users,
} from '@beaconhs/db/schema'
import { PageContainer } from '@/components/page-layout'
import { requireRequestContext } from '@/lib/auth'
import { MAINTENANCE_STATUSES } from '@/lib/hospitality/maintenance'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { assertCan, can } from '@beaconhs/tenant'
import { updateMaintenanceIssueAction } from '../../properties/actions'

export default async function IssuePage({ params }: { params: Promise<{ issueId: string }> }) {
  const [translateHospitality, translateValue] = await Promise.all([
    getGeneratedTranslations(),
    getGeneratedValueTranslations(),
  ])
  const { issueId } = await params
  if (!isUuid(issueId)) notFound()
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.maintenance')
  assertCan(ctx, 'maintenance.read')
  const data = await ctx.db(async (tx) => {
    const [row] = await tx
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
      .where(and(eq(maintenanceIssues.tenantId, ctx.tenantId), eq(maintenanceIssues.id, issueId)))
      .limit(1)
    const members = await tx
      .select({ id: tenantUsers.id, name: tenantUsers.displayName, email: users.email })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.status, 'active')))
      .limit(250)
    return { row, members }
  })
  if (!data.row) notFound()
  const { issue: r } = data.row
  const selectedStatus =
    r.status === 'triaged' ? 'assigned' : r.status === 'work_ordered' ? 'in_progress' : r.status
  return (
    <PageContainer>
      <PageHeader
        title={r.summary}
        description={`${r.reference} · ${r.priority} · ${r.status.replaceAll('_', ' ')}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/hospitality/maintenance">{translateValue('Back to queue')}</Link>
          </Button>
        }
      />
      <section className="mt-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground text-sm">{translateValue('Location')}</p>
          <p>
            {data.row.propertyName} · {translateValue('Room')}{' '}
            {data.row.roomName || data.row.roomCode}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">{translateValue('Reported via')}</p>
          <p>{r.source.replaceAll('_', ' ')}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-muted-foreground text-sm">{translateValue('Details')}</p>
          <p className="whitespace-pre-wrap">
            {r.description || translateValue('No description supplied.')}
          </p>
        </div>
        {r.source === 'guest_qr' && (r.guestName || r.guestContact) && (
          <div className="sm:col-span-2">
            <p className="text-muted-foreground text-sm">{translateValue('Guest follow-up')}</p>
            <p>
              {[r.guestName, r.guestContactConsent ? r.guestContact : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        )}
      </section>
      {can(ctx, 'maintenance.update') && (
        <form
          action={updateMaintenanceIssueAction}
          className="mt-4 grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
        >
          <input type="hidden" name="issueId" value={r.id} />
          <Label>
            {translateHospitality('m_00f0e2904a371c')}
            <Select name="priority" defaultValue={r.priority}>
              {['low', 'medium', 'high', 'critical'].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            {translateHospitality('m_0b9da892d6faf0')}
            <Select name="status" defaultValue={selectedStatus}>
              {MAINTENANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            {translateHospitality('m_03a84b76ec2cd1')}
            <Select name="assignee" defaultValue={r.assignedToTenantUserId ?? ''}>
              <option value="">{translateValue('Unassigned')}</option>
              {data.members.map((member) => (
                <option value={member.id} key={member.id}>
                  {member.name || member.email}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="sm:col-span-2">
            {translateHospitality('m_0686fdc3ff30ad')}
            <textarea
              name="resolutionNotes"
              rows={4}
              maxLength={2000}
              defaultValue={r.resolutionNotes ?? ''}
              className="bg-background mt-1 w-full rounded-md border px-3 py-2"
            />
          </Label>
          <Button type="submit" className="sm:col-span-2">
            {translateHospitality('m_0727c17a09623c')}
          </Button>
        </form>
      )}
    </PageContainer>
  )
}
