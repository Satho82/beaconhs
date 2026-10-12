import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { enqueueEmail, enqueueNotification } from '@beaconhs/jobs'

export async function deliverApprovalNotification(
  tenantId: string,
  eventId: string,
  requestId: string,
) {
  const recipients = await withSuperAdmin(db, async (tx) => {
    // Recheck entitlement and same-assignment property authority at delivery time.
    return tx.execute(sql`SELECT DISTINCT u.user_id,a.email,coalesce(w.email_enabled,false) AS email_enabled,coalesce(w.in_app_enabled,true) AS in_app_enabled
      FROM approval_requests r JOIN tenant_users u ON u.tenant_id=r.tenant_id AND u.status='active'
      AND u.id IN (r.requester_id,approval_effective_assignee(r.tenant_id,r.property_id,r.id,r.current_stage))
      JOIN "user" a ON a.id=u.user_id AND a.disabled_at IS NULL
      JOIN tenants t ON t.id=r.tenant_id AND t.status='active'
      LEFT JOIN approval_workflow_rules w ON w.tenant_id=r.tenant_id AND w.property_id=r.property_id AND w.workflow_id=r.workflow_id
      WHERE r.tenant_id=${tenantId} AND r.id=${requestId}
      AND EXISTS(SELECT 1 FROM tenant_module_entitlements e WHERE e.tenant_id=r.tenant_id AND e.module_key='approvals' AND e.state='enabled'
        AND (e.effective_from IS NULL OR e.effective_from<=now()) AND (e.effective_until IS NULL OR e.effective_until>now()))
      AND EXISTS(SELECT 1 FROM role_assignments ra JOIN roles ro ON ro.tenant_id=ra.tenant_id AND ro.id=ra.role_id
        WHERE ra.tenant_id=r.tenant_id AND ra.tenant_user_id=u.id
        AND (ro.permissions ? 'approvals.read' OR ro.permissions ? 'approvals.*' OR ro.permissions ? '*')
        AND (ra.scope->>'type'='tenant' OR (ra.scope->>'type'='properties' AND ra.scope->'propertyIds' ? r.property_id::text)))
      AND NOT EXISTS(SELECT 1 FROM user_permission_overrides o WHERE o.tenant_id=r.tenant_id AND o.tenant_user_id=u.id AND o.effect='deny' AND o.permission IN ('*','approvals.*','approvals.read'))`)
  })
  const linkPath = '/approvals/requests/' + requestId
  const title = 'An approval request needs your attention'
  // Generic messages contain no financial details or document/comment content.
  for (const recipient of recipients) {
    const jobId =
      'approval|' +
      createHash('sha256')
        .update(eventId + '|' + String(recipient.user_id))
        .digest('hex')
    if (recipient.in_app_enabled)
      await enqueueNotification(
        {
          tenantId,
          userIds: [String(recipient.user_id)],
          category: 'approvals',
          type: 'approval.updated',
          title,
          linkPath,
          channels: ['in_app'],
        },
        { jobId },
      )
    if (recipient.email_enabled)
      await enqueueEmail(
        {
          to: String(recipient.email),
          subject: title,
          html: '<p>Sign in to Uvanoo and open Approvals to review the latest request activity.</p>',
          text: 'Sign in to Uvanoo and open Approvals to review the latest request activity.',
          meta: {
            tenantId,
            userId: String(recipient.user_id),
            category: 'approvals',
            automaticNotification: true,
          },
        },
        { jobId: jobId + '|email' },
      )
  }
}
