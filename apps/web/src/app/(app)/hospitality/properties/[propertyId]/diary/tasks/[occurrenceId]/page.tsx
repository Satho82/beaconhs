import { getGeneratedTranslations } from '@/i18n/generated.server'
import { isUuid } from '@/lib/list-params'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button, PageHeader } from '@beaconhs/ui'
import { can } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { getDiaryOccurrenceDetail } from '@/lib/hospitality/diary'
import { createDiaryCorrectiveActionAction } from '../../actions'

const labels: Record<string, string> = {
  upcoming_reminder: 'Reminder sent',
  due_notification: 'Due notification sent',
  overdue_notification: 'Overdue notification sent',
  manager_notification: 'Manager notified',
  escalated: 'Escalated',
}

export default async function DiaryTaskPage({
  params,
}: {
  params: Promise<{ propertyId: string; occurrenceId: string }>
}) {
  const translateHospitality = await getGeneratedTranslations()

  const { propertyId, occurrenceId } = await params
  if (!isUuid(propertyId) || !isUuid(occurrenceId)) notFound()

  const ctx = await requireRequestContext()
  const task = await getDiaryOccurrenceDetail(ctx, propertyId, occurrenceId)
  const overdue = task.overdue
  const manage = can(ctx, 'hospitality.manage')
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader
        title={task.template.title}
        description={translateHospitality('m_0088a3fd972236', {
          value0: task.occurrence.status,
          value1: task.occurrence.dueAt.toLocaleString(),
        })}
        actions={
          <Button asChild variant="outline">
            <Link href={`/hospitality/properties/${propertyId}/diary`}>
              {translateHospitality('m_0c49cf654fea3d')}
            </Link>
          </Button>
        }
      />
      <section className="mt-5 rounded-lg border p-4">
        <p>{task.template.instructions || translateHospitality('m_0e95ab8396ef45')}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_14ad4ca1d87e79')}</dt>
            <dd>{task.occurrence.occurrenceAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_0c2eb92551e08b')}</dt>
            <dd>{task.occurrence.dueAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_14c7a1feb33b17')}</dt>
            <dd>{task.schedule.timezone}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_1e40bdcf2d1ba1')}</dt>
            <dd>
              {overdue
                ? translateHospitality('m_1913f12b318c34', {
                    value0: task.overdueHours,
                  })
                : translateHospitality('m_117d1a5e1ef440')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_0ba7a5e1b2fa32')}</dt>
            <dd>
              {task.occurrence.completedAt?.toLocaleString() ??
                translateHospitality('m_13aa3db73e795e')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{translateHospitality('m_0a4c0368f55bbf')}</dt>
            <dd>{task.occurrence.completionNotes ?? '—'}</dd>
          </div>
        </dl>
      </section>
      <section className="mt-5 rounded-lg border p-4">
        <h2 className="font-semibold">{translateHospitality('m_0180eccbdf9214')}</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {task.events.length ? (
            task.events.map((event) => (
              <li key={event.id}>
                {labels[event.stage] ?? event.stage}{' '}
                <span className="text-muted-foreground">
                  · {event.processedAt.toLocaleString()}
                </span>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">{translateHospitality('m_165d753cff9d77')}</li>
          )}
        </ol>
      </section>
      <section className="mt-5 rounded-lg border p-4">
        <h2 className="font-semibold">{translateHospitality('m_004f8059566564')}</h2>
        {task.correctiveAction ? (
          <p className="mt-2">
            <Link className="underline" href={`/corrective-actions/${task.correctiveAction.id}`}>
              {task.correctiveAction.reference} · {task.correctiveAction.title} (
              {task.correctiveAction.status})
            </Link>
          </p>
        ) : manage && overdue ? (
          <form action={createDiaryCorrectiveActionAction} className="mt-3">
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="occurrenceId" value={occurrenceId} />
            <Button>{translateHospitality('m_131e14ceaaa269')}</Button>
          </form>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            {translateHospitality('m_0b85a100063050')}
          </p>
        )}
      </section>
    </main>
  )
}
