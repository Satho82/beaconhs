import { sql } from 'drizzle-orm'
import { can, type RequestContext } from '@beaconhs/tenant'
import { approvalReadScope } from './service'
import { approvalPropertyIds } from './property-authority'

/** All preview lists, counts and history consume this server-authorized collection.
 * SQL restricts records before limits or serialization; UI filters only narrow it.
 */
export async function readPreviewCollections(ctx: RequestContext) {
  return ctx.db(async (tx) => {
    const { fresh, propertyIds } = await approvalReadScope(tx, ctx)
    const scope = sql`SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(propertyIds)}::jsonb)`
    const requests =
      await tx.execute(sql`SELECT r.*,u.display_name AS creator,a.display_name AS approver,s.approver_id,p.metadata AS source_details
      FROM approval_requests r JOIN tenant_users u ON u.tenant_id=r.tenant_id AND u.id=r.requester_id
      JOIN approval_stages s ON s.tenant_id=r.tenant_id AND s.property_id=r.property_id AND s.request_id=r.id AND s.position=r.current_stage
      JOIN tenant_users a ON a.tenant_id=s.tenant_id AND a.id=s.approver_id
      LEFT JOIN audit_log p ON p.tenant_id=r.tenant_id AND p.entity_id=r.source_id AND p.entity_type='preview_approval_source' AND p.dedup_key='preview-source:' || r.source_id
      WHERE r.tenant_id=${ctx.tenantId} AND r.property_id IN (${scope})
      ORDER BY r.created_at DESC,r.id LIMIT 200`)
    const workflows = await tx.execute(sql`SELECT id,name,stages FROM approval_workflows
      WHERE tenant_id=${ctx.tenantId} AND property_id IN (${scope}) AND active=true
      ORDER BY created_at DESC,id LIMIT 50`)
    const configurePropertyIds =
      can(ctx, 'approvals.configure') && can(fresh, 'approvals.configure')
        ? await approvalPropertyIds(tx, ctx, fresh, 'approvals.configure')
        : []
    return {
      requests,
      workflows,
      configurePropertyIds,
      permissions: [...fresh.permissions].filter((p) => can(ctx, p)),
    }
  })
}
