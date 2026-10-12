import { sql } from 'drizzle-orm'
import { db, withSuperAdmin, withTenant } from '@beaconhs/db'
import { recordDomainEvent } from '@beaconhs/events'

export async function scanApprovalReminders(slot: Date): Promise<void> {
  if (!Number.isFinite(slot.getTime())) throw new Error('Invalid reminder slot')
  const tenants = await withSuperAdmin(db, (tx) =>
    tx.execute(sql`SELECT t.id FROM tenants t JOIN tenant_module_entitlements e ON e.tenant_id=t.id
    WHERE t.status='active' AND e.module_key='approvals' AND e.state='enabled' AND (e.effective_from IS NULL OR e.effective_from<=now()) AND (e.effective_until IS NULL OR e.effective_until>now()) ORDER BY t.id`),
  )
  for (const tenant of tenants) {
    let cursor = '00000000-0000-0000-0000-000000000000'
    while (true) {
      const ids = await withTenant(db, String(tenant.id), async (tx) => {
        const requests =
          await tx.execute(sql`SELECT r.id,r.created_at,w.reminder_hours FROM approval_requests r
          JOIN approval_workflow_rules w ON w.tenant_id=r.tenant_id AND w.property_id=r.property_id AND w.workflow_id=r.workflow_id
          WHERE r.tenant_id=${tenant.id} AND r.id>${cursor}::uuid AND r.status='pending'
          AND r.created_at<=${slot.toISOString()}::timestamptz-make_interval(hours=>w.reminder_hours)
          ORDER BY r.id LIMIT 100 FOR SHARE OF r`)
        for (const r of requests) {
          const bucket = Math.floor(
            (slot.getTime() - new Date(String(r.created_at)).getTime()) /
              (Number(r.reminder_hours) * 3600000),
          )
          await recordDomainEvent(tx, {
            tenantId: String(tenant.id),
            eventType: 'approval.reminder',
            subjectId: String(r.id),
            dedupKey: 'approval.reminder:' + String(r.id) + ':' + bucket,
            payload: { notification: { kind: 'approval_updated', requestId: String(r.id) } },
          })
        }
        return requests.map((r) => String(r.id))
      })
      if (!ids.length) break
      cursor = ids.at(-1)!
    }
  }
}
