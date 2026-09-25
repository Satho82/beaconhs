import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { Button, Input, Label, PageHeader, Select } from '@beaconhs/ui'
import { can } from '@beaconhs/tenant'
import { tenantUsers, users } from '@beaconhs/db/schema'
import { requireRequestContext } from '@/lib/auth'
import { getDiaryTemplate } from '@/lib/hospitality/diary'
import { setDiaryTemplateActiveAction, updateDiaryTemplateAction } from '../../actions'

export default async function DiaryTemplatePage({
  params,
}: {
  params: Promise<{ propertyId: string; scheduleId: string }>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId, scheduleId } = await params
  if (!isUuid(propertyId) || !isUuid(scheduleId)) notFound()

  const ctx = await requireRequestContext()
  const { property, schedule, template } = await getDiaryTemplate(ctx, propertyId, scheduleId)
  const members = await ctx.db((tx) =>
    tx
      .select({ id: tenantUsers.id, name: tenantUsers.displayName, email: users.email })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, ctx.tenantId), eq(tenantUsers.status, 'active'))),
  )
  const recurrence = schedule.recurrence as { kind?: string; cron?: string }
  const parts = recurrence.cron?.split(' ') ?? []
  const dueTime =
    parts.length === 5
      ? `${String(parts[1]).padStart(2, '0')}:${String(parts[0]).padStart(2, '0')}`
      : '09:00'
  const manage = can(ctx, 'hospitality.manage')
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader
        title={template.title}
        description={`${property.name} · ${schedule.isActive ? 'Active' : 'Inactive'} · ${schedule.timezone}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/hospitality/properties/${propertyId}/diary`}>
              {translateHospitality('m_0c49cf654fea3d')}
            </Link>
          </Button>
        }
      />
      <section className="mt-5 rounded-lg border p-4">
        <p className="text-sm">
          {template.instructions || translateHospitality('m_0e95ab8396ef45')}
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_1e136c2b83657a')}</dt>
            <dd>{recurrence.kind ?? translateHospitality('m_0abce084240d5f')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_13ce7cbe1f05b4')}</dt>
            <dd>{dueTime}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_10cbe051fb5e05')}</dt>
            <dd>{template.createdAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_01da19754e16f7')}</dt>
            <dd>{template.updatedAt.toLocaleString()}</dd>
          </div>
        </dl>
      </section>
      {manage && (
        <section className="mt-5 rounded-lg border p-4">
          <h2 className="font-semibold">{translateHospitality('m_1e56d76ad7e861')}</h2>
          <form action={updateDiaryTemplateAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="scheduleId" value={scheduleId} />
            <Label>
              {translateHospitality('m_0decefd558c355')}
              <Input name="title" defaultValue={template.title} required />
            </Label>
            <Label>
              {translateHospitality('m_13ce7cbe1f05b4')}
              <Input name="dueTime" type="time" defaultValue={dueTime} required />
            </Label>
            <Label className="sm:col-span-2">
              {translateHospitality('m_146cd84bfd9be5')}
              <Input name="instructions" defaultValue={template.instructions ?? ''} />
            </Label>
            <Label>
              {translateHospitality('m_1e136c2b83657a')}
              <Select name="recurrence" defaultValue={recurrence.kind ?? 'daily'}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </Label>
            <Label>
              {translateHospitality('m_0a19a9b2e7c15d')}
              <Select name="weekday" defaultValue={parts[4] ?? '1'}>
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
              {translateHospitality('m_0d7e6fdf2393a0')}
              <Input
                name="monthDay"
                type="number"
                min="1"
                max="28"
                defaultValue={parts[2] ?? '1'}
              />
            </Label>
            <Label>
              {translateHospitality('m_14c7a1feb33b17')}
              <Input name="timezone" defaultValue={schedule.timezone} required />
            </Label>
            <Label>
              {translateHospitality('m_03a84b76ec2cd1')}
              <Select name="assigneeId" defaultValue={schedule.assignedToTenantUserId ?? ''}>
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email}
                  </option>
                ))}
              </Select>
            </Label>
            <div className="flex items-end">
              <Button type="submit">{translateHospitality('m_1ab9025ed1067c')}</Button>
            </div>
          </form>
          <form action={setDiaryTemplateActiveAction} className="mt-4">
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="scheduleId" value={scheduleId} />
            <input type="hidden" name="isActive" value={schedule.isActive ? 'false' : 'true'} />
            <Button type="submit" variant="outline">
              {schedule.isActive
                ? translateHospitality('m_190952a7615a65')
                : translateHospitality('m_0075ad79e5b233')}
            </Button>
          </form>
        </section>
      )}
    </main>
  )
}
