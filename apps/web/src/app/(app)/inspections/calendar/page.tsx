import Link from 'next/link'
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm'
import { Badge, Button, EmptyState, PageHeader, Select } from '@beaconhs/ui'
import {
  hospitalityProperties,
  inspectionTypes,
  operationalTaskOccurrences,
  operationalTaskSchedules,
  operationalTaskTemplates,
  tenantUsers,
  users,
} from '@beaconhs/db/schema'
import { assertCan, can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { PageContainer } from '@/components/page-layout'
import { InspectionsSubNav } from '../_sub-nav'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
import { hospitalityPropertyWhere } from '@/lib/hospitality/property-access'
import { createInspectionSchedule, setInspectionScheduleActive } from './_actions'

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
const kindLabel = (recurrence: Record<string, unknown>) =>
  String(recurrence.kind ?? 'scheduled').replace(/^./, (value) => value.toUpperCase())

export default async function InspectionCalendarPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'inspections.read.self')
  await assertTenantModuleEntitled(ctx, 'hospitality.diary')
  const canManage = can(ctx, 'inspections.manage')
  const now = new Date()
  const horizon = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000)
  const [properties, types, members, schedules, occurrences] = await ctx.db(async (tx) => {
    const propertyWhere = and(
      eq(hospitalityProperties.tenantId, ctx.tenantId),
      isNull(hospitalityProperties.deletedAt),
      hospitalityPropertyWhere(ctx, hospitalityProperties.id),
    )
    return Promise.all([
      tx
        .select({ id: hospitalityProperties.id, name: hospitalityProperties.name })
        .from(hospitalityProperties)
        .where(propertyWhere)
        .orderBy(asc(hospitalityProperties.name)),
      tx
        .select({
          id: inspectionTypes.id,
          name: inspectionTypes.name,
          defaultCadence: inspectionTypes.defaultCadence,
        })
        .from(inspectionTypes)
        .where(
          and(
            eq(inspectionTypes.tenantId, ctx.tenantId),
            eq(inspectionTypes.isPublished, true),
            isNull(inspectionTypes.deletedAt),
          ),
        )
        .orderBy(asc(inspectionTypes.name)),
      tx
        .select({ id: tenantUsers.id, name: users.name })
        .from(tenantUsers)
        .innerJoin(users, eq(users.id, tenantUsers.userId))
        .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.status, 'active')))
        .orderBy(asc(users.name)),
      tx
        .select({
          schedule: operationalTaskSchedules,
          type: inspectionTypes,
          property: hospitalityProperties,
          assignee: users.name,
        })
        .from(operationalTaskSchedules)
        .innerJoin(
          inspectionTypes,
          and(
            eq(inspectionTypes.tenantId, operationalTaskSchedules.tenantId),
            eq(inspectionTypes.id, operationalTaskSchedules.inspectionTypeId),
          ),
        )
        .innerJoin(
          hospitalityProperties,
          and(
            eq(hospitalityProperties.tenantId, operationalTaskSchedules.tenantId),
            eq(hospitalityProperties.id, operationalTaskSchedules.propertyId),
          ),
        )
        .leftJoin(tenantUsers, eq(tenantUsers.id, operationalTaskSchedules.assignedToTenantUserId))
        .leftJoin(users, eq(users.id, tenantUsers.userId))
        .where(
          and(
            eq(operationalTaskSchedules.tenantId, ctx.tenantId),
            isNull(inspectionTypes.deletedAt),
            isNull(hospitalityProperties.deletedAt),
            hospitalityPropertyWhere(ctx, hospitalityProperties.id),
          ),
        )
        .orderBy(asc(inspectionTypes.name)),
      tx
        .select({
          occurrence: operationalTaskOccurrences,
          schedule: operationalTaskSchedules,
          type: inspectionTypes,
          property: hospitalityProperties,
        })
        .from(operationalTaskOccurrences)
        .innerJoin(
          operationalTaskSchedules,
          and(
            eq(operationalTaskSchedules.tenantId, operationalTaskOccurrences.tenantId),
            eq(operationalTaskSchedules.id, operationalTaskOccurrences.scheduleId),
          ),
        )
        .innerJoin(
          inspectionTypes,
          and(
            eq(inspectionTypes.tenantId, operationalTaskSchedules.tenantId),
            eq(inspectionTypes.id, operationalTaskSchedules.inspectionTypeId),
          ),
        )
        .innerJoin(
          hospitalityProperties,
          and(
            eq(hospitalityProperties.tenantId, operationalTaskSchedules.tenantId),
            eq(hospitalityProperties.id, operationalTaskSchedules.propertyId),
          ),
        )
        .where(
          and(
            eq(operationalTaskOccurrences.tenantId, ctx.tenantId),
            gte(operationalTaskOccurrences.dueAt, now),
            lte(operationalTaskOccurrences.dueAt, horizon),
            hospitalityPropertyWhere(ctx, hospitalityProperties.id),
          ),
        )
        .orderBy(asc(operationalTaskOccurrences.dueAt)),
    ])
  })

  return (
    <PageContainer>
      <InspectionsSubNav active="calendar" />
      <PageHeader
        title="Inspection calendar"
        description="Schedule published inspection types by property. The operational diary creates occurrences and sends reminders from the same recurrence engine."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
          <p className="text-sm text-slate-600">Active schedules</p>
          <p className="mt-1 text-3xl font-semibold text-teal-800">
            {schedules.filter((row) => row.schedule.isActive).length}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
          <p className="text-sm text-slate-600">Due in 31 days</p>
          <p className="mt-1 text-3xl font-semibold text-orange-800">
            {
              occurrences.filter(
                (row) => !['completed', 'cancelled', 'waived'].includes(row.occurrence.status),
              ).length
            }
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Completed in view</p>
          <p className="mt-1 text-3xl font-semibold">
            {occurrences.filter((row) => row.occurrence.status === 'completed').length}
          </p>
        </div>
      </div>
      {canManage ? (
        <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-semibold text-slate-900">
            Schedule an inspection
          </summary>
          <form action={createInspectionSchedule} className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium">
              Inspection type
              <Select
                name="typeId"
                required
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              >
                <option value="">Choose type</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {type.defaultCadence ? ` · ${type.defaultCadence}` : ''}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium">
              Property
              <Select
                name="propertyId"
                required
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              >
                <option value="">Choose property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium">
              Frequency
              <Select
                name="recurrence"
                defaultValue="weekly"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </label>
            <label className="text-sm font-medium">
              Due time
              <input
                name="dueTime"
                type="time"
                defaultValue="09:00"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Weekday (0=Sun)
              <input
                name="weekday"
                type="number"
                min="0"
                max="6"
                defaultValue="1"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Day of month
              <input
                name="monthDay"
                type="number"
                min="1"
                max="28"
                defaultValue="1"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Annual month
              <input
                name="annualMonth"
                type="number"
                min="1"
                max="12"
                defaultValue="1"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              />
            </label>
            <label className="text-sm font-medium">
              Assigned to
              <Select
                name="assigneeId"
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end">
              <Button type="submit">Create recurring schedule</Button>
            </div>
          </form>
        </details>
      ) : null}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <span className="text-sm text-slate-500">Next 31 days</span>
        </div>
        {occurrences.length === 0 ? (
          <EmptyState
            icon={<span>◌</span>}
            title="No generated inspection occurrences yet"
            description="Create a schedule; the diary worker generates the next occurrences and their reminder lifecycle."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {occurrences.map((row) => (
              <div
                key={row.occurrence.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">{row.type.name}</p>
                    <p className="text-sm text-slate-500">
                      {row.property.name} · {formatDate(row.occurrence.dueAt)}
                    </p>
                  </div>
                  <Badge variant={row.occurrence.status === 'completed' ? 'success' : 'secondary'}>
                    {row.occurrence.status.replaceAll('_', ' ')}
                  </Badge>
                </div>
                <div className="mt-3">
                  <Link
                    className="text-sm font-medium text-teal-700 hover:underline"
                    href={`/inspections/records/new?typeId=${row.type.id}&propertyId=${row.property.id}`}
                  >
                    Start inspection
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recurring schedules</h2>
        {schedules.length === 0 ? (
          <EmptyState
            icon={<span>◌</span>}
            title="No inspection schedules"
            description="Published inspection types can be scheduled for any property."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {schedules.map((row) => (
              <div
                key={row.schedule.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-0"
              >
                <div>
                  <p className="font-semibold">{row.type.name}</p>
                  <p className="text-sm text-slate-500">
                    {row.property.name} · {kindLabel(row.schedule.recurrence)} ·{' '}
                    {row.assignee ?? 'Unassigned'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={row.schedule.isActive ? 'success' : 'secondary'}>
                    {row.schedule.isActive ? 'Active' : 'Paused'}
                  </Badge>
                  {canManage ? (
                    <form action={setInspectionScheduleActive}>
                      <input type="hidden" name="scheduleId" value={row.schedule.id} />
                      <input type="hidden" name="isActive" value={String(!row.schedule.isActive)} />
                      <Button type="submit" variant="outline">
                        {row.schedule.isActive ? 'Pause' : 'Resume'}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  )
}
