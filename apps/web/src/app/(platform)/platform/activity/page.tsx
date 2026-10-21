import { desc, eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { platformAuditLog, users } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { PageContainer } from '@/components/page-layout'
import { DetailHeader, EmptyState } from '@beaconhs/ui'

export const dynamic = 'force-dynamic'

/** Super-admin-only operational audit trail. Technical exception ingestion is separate. */
export default async function PlatformActivityPage() {
  await requirePlatformOperator()
  const events = await withSuperAdmin(db, (tx) =>
    tx
      .select({
        id: platformAuditLog.id,
        action: platformAuditLog.action,
        summary: platformAuditLog.summary,
        occurredAt: platformAuditLog.occurredAt,
        actor: users.email,
      })
      .from(platformAuditLog)
      .leftJoin(users, eq(users.id, platformAuditLog.actorUserId))
      .orderBy(desc(platformAuditLog.occurredAt))
      .limit(250),
  )

  return (
    <PageContainer>
      <div className="space-y-5">
        <DetailHeader
          back={{ href: '/platform', label: 'Platform administration' }}
          title="Platform activity"
          subtitle="Recent platform administration actions. Visible only to super admins."
        />
        {events.length ? (
          <div className="overflow-hidden rounded-xl border bg-white dark:bg-slate-900">
            <ul className="divide-y">
              {events.map((event) => (
                <li key={event.id} className="px-5 py-4">
                  <p className="font-medium">{event.summary || event.action}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {event.actor || 'System'} · {event.occurredAt.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState title="No platform activity yet" description="Actions will appear here as they are recorded." />
        )}
      </div>
    </PageContainer>
  )
}
