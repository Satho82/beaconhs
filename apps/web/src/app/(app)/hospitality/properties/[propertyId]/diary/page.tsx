import { useGeneratedTranslations } from '@/i18n/generated'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { Button, EmptyState, Input, Label, PageHeader, Select } from '@beaconhs/ui'
import { tenantUsers, users } from '@beaconhs/db/schema'
import { can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { listPropertyDiary } from '@/lib/hospitality/diary'
import {
  createDiaryTemplateAction,
  completeDiaryTaskAction,
  setDiaryTemplateActiveAction,
} from './actions'

export const dynamic = 'force-dynamic'

export default async function PropertyDiaryPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId } = await params
  if (!isUuid(propertyId)) notFound()

  const ctx = await requireRequestContext()

  const tasks = await listPropertyDiary(ctx, propertyId)
  const members = await ctx.db((tx) =>
    tx
      .select({ id: tenantUsers.id, name: tenantUsers.displayName, email: users.email })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.status, 'active'))),
  )
  const manage = can(ctx, 'hospitality.manage')
  const today = tasks.filter((row) => !row.overdue && row.occurrence.status !== 'completed')
  const overdue = tasks.filter((row) => row.overdue)
  const completed = tasks.filter((row) => row.occurrence.status === 'completed')
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title={translateHospitality('m_114c256e1be9fb')}
        description={translateHospitality('m_19ec77b0e8fee1')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/hospitality/properties/${propertyId}/signoff`}>
                {translateHospitality('m_04e9edeb84cfb2')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/hospitality/properties/${propertyId}`}>
                {translateHospitality('m_19920bd04d06ea')}
              </Link>
            </Button>
          </div>
        }
      />
      {manage && (
        <section className="mt-5 rounded-lg border p-4">
          <h2 className="font-semibold">{translateHospitality('m_180c6726b01545')}</h2>
          <form action={createDiaryTemplateAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="propertyId" value={propertyId} />
            <Label className="sm:col-span-2">
              {' '}
              {translateHospitality('m_0decefd558c355')}{' '}
              <Input
                name="title"
                required
                maxLength={200}
                placeholder={translateHospitality('m_147ba97e98aba3')}
              />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_13ce7cbe1f05b4')}{' '}
              <Input name="dueTime" type="time" defaultValue="09:00" required />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_146cd84bfd9be5')}{' '}
              <Input name="instructions" maxLength={4000} />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_1e136c2b83657a')}{' '}
              <Select name="recurrence" defaultValue="daily">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_07d6a7f122ba21')}{' '}
              <Select name="weekday" defaultValue="1">
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </Select>
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_1e83395904d2fc')}{' '}
              <Input name="monthDay" type="number" min="1" max="28" defaultValue="1" />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_14c7a1feb33b17')}{' '}
              <Input name="timezone" defaultValue={ctx.timezone} required />
            </Label>
            <Label>
              {' '}
              {translateHospitality('m_03a84b76ec2cd1')}{' '}
              <Select name="assigneeId" defaultValue="">
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email}
                  </option>
                ))}
              </Select>
            </Label>
            <div className="flex items-end">
              <Button type="submit">{translateHospitality('m_00ab7ce4db45ab')}</Button>
            </div>
          </form>
        </section>
      )}
      <DiarySection
        title={translateHospitality('m_1e40bdcf2d1ba1')}
        rows={overdue}
        propertyId={propertyId}
        manage={manage}
      />
      <DiarySection
        title={translateHospitality('m_13eae860c37bcb')}
        rows={today}
        propertyId={propertyId}
        manage={manage}
      />
      <DiarySection
        title={translateHospitality('m_0ba7a5e1b2fa32')}
        rows={completed}
        propertyId={propertyId}
        manage={manage}
      />
    </main>
  )
}

function DiarySection({
  title,
  rows,
  propertyId,
  manage,
}: {
  title: string
  rows: Awaited<ReturnType<typeof listPropertyDiary>>
  propertyId: string
  manage: boolean
}) {
  const translateHospitality = useGeneratedTranslations()

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState
          title={translateHospitality('m_090ad697c32b5a', { value0: title.toLowerCase() })}
        />
      ) : (
        <div className="mt-3 grid gap-3">
          {rows.map(({ occurrence, schedule, template, overdue, overdueHours }) => (
            <article className="rounded-lg border p-4" key={occurrence.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="font-medium">{template.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {' '}
                    {translateHospitality(
                      'm_0c2eb92551e08b',
                    )} {occurrence.dueAt.toLocaleString()} ·{' '}
                    {overdue ? translateHospitality('m_06e3b632d95096') : occurrence.status}
                  </p>
                  {overdue && (
                    <p className="text-destructive text-sm">
                      {' '}
                      {translateHospitality('m_1e40bdcf2d1ba1')} {overdueHours}
                      {translateHospitality('m_0e3010419001f6')}{' '}
                    </p>
                  )}
                  {template.instructions && <p className="mt-2 text-sm">{template.instructions}</p>}
                </div>
                <span className="text-muted-foreground text-xs">{schedule.timezone}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/hospitality/properties/${propertyId}/diary/tasks/${occurrence.id}`}>
                    {' '}
                    {translateHospitality('m_1c2654d15ea608')}{' '}
                  </Link>
                </Button>
                {manage && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/hospitality/properties/${propertyId}/diary/templates/${schedule.id}`}
                    >
                      {' '}
                      {translateHospitality('m_0eb646e1175be5')}{' '}
                    </Link>
                  </Button>
                )}
                {manage && overdue && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/corrective-actions/new?sourceEntityType=operational_task_occurrence&sourceEntityId=${occurrence.id}`}
                    >
                      {' '}
                      {translateHospitality('m_131e14ceaaa269')}{' '}
                    </Link>
                  </Button>
                )}
              </div>
              {manage && occurrence.status !== 'completed' && (
                <form
                  action={completeDiaryTaskAction}
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                >
                  <input type="hidden" name="propertyId" value={propertyId} />
                  <input type="hidden" name="occurrenceId" value={occurrence.id} />
                  <Input
                    name="completionNotes"
                    placeholder={translateHospitality('m_0a4c0368f55bbf')}
                  />
                  <Button type="submit">{translateHospitality('m_1aef882ac60efc')}</Button>
                </form>
              )}
              {manage && (
                <form action={setDiaryTemplateActiveAction} className="mt-2">
                  <input type="hidden" name="propertyId" value={propertyId} />
                  <input type="hidden" name="scheduleId" value={schedule.id} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={schedule.isActive ? 'false' : 'true'}
                  />
                  <Button size="sm" variant="outline" type="submit">
                    {schedule.isActive
                      ? translateHospitality('m_0dfd24e12eb435')
                      : translateHospitality('m_0c1c3348b0b7bb')}
                  </Button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
