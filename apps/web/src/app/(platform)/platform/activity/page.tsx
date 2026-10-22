import { desc, eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { platformAuditLog, platformErrorLog, users } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { PageContainer } from '@/components/page-layout'
import { DetailHeader, EmptyState } from '@beaconhs/ui'
import { getGeneratedValueTranslations } from '@/i18n/generated.server'

export const dynamic = 'force-dynamic'

/** Super-admin-only operational audit trail. Technical exception ingestion is separate. */
export default async function PlatformActivityPage() {
  const t = await getGeneratedValueTranslations()
  await requirePlatformOperator()
  const [events, errors] = await Promise.all([
    withSuperAdmin(db, (tx) =>
      tx.select({ id: platformAuditLog.id, action: platformAuditLog.action, summary: platformAuditLog.summary, occurredAt: platformAuditLog.occurredAt, actor: users.email })
        .from(platformAuditLog).leftJoin(users, eq(users.id, platformAuditLog.actorUserId))
        .orderBy(desc(platformAuditLog.occurredAt)).limit(250),
    ),
    withSuperAdmin(db, (tx) =>
      tx.select().from(platformErrorLog).orderBy(desc(platformErrorLog.occurredAt)).limit(100),
    ),
  ])
  return (
    <PageContainer>
      <div className="space-y-5">
        <DetailHeader
          back={{ href: '/platform', label: t('Platform administration') }}
          title={t('Platform activity')}
          subtitle={t('Recent platform administration actions. Visible only to super admins.')}
        />
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 dark:bg-red-950/20">
          <h2 className="font-semibold">{t('Platform errors')}</h2>
          {errors.length ? (
            <ul className="mt-3 space-y-3 text-sm">
              {errors.map((error) => (
                <li key={error.id}>
                  <p className="font-medium">{error.message}</p>
                  <p className="text-slate-600">{error.path || error.source} · {error.occurredAt.toLocaleString()}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-600">{t('No captured server errors.')}</p>}
        </section>
        {events.length ? (
          <div className="overflow-hidden rounded-xl border bg-white dark:bg-slate-900">
            <ul className="divide-y">
              {events.map((event) => (
                <li key={event.id} className="px-5 py-4">
                  <p className="font-medium">{t(event.summary || event.action)}</p>
                  <p className="mt-1 text-sm text-slate-500">{event.actor || t('System')} · {event.occurredAt.toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : <EmptyState title={t('No platform activity yet')} description={t('Actions will appear here as they are recorded.')} />}
      </div>
    </PageContainer>
  )
}
