import { sql } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import type { RoleScope } from '@beaconhs/db/schema'
import { assertCan, can, canSeeProperty, type RequestContext } from '@beaconhs/tenant'

type Assignment = { permissions: string[]; scope: RoleScope; role_id: string }
export function assignmentAllowsProperty(
  rows: Assignment[],
  permission: string,
  propertyId: string,
  activeRoleId?: string | null,
) {
  return rows.some((row) => {
    if (activeRoleId && row.role_id !== activeRoleId) return false
    const assignment = {
      isSuperAdmin: false,
      permissions: new Set(row.permissions),
      scopes: [row.scope],
    }
    return can(assignment, permission) && canSeeProperty(assignment as RequestContext, propertyId)
  })
}

async function assignments(tx: Database, ctx: RequestContext, memberId: string) {
  return (await tx.execute(sql`SELECT r.permissions,a.scope,a.role_id
    FROM role_assignments a JOIN roles r ON r.id=a.role_id AND r.tenant_id=a.tenant_id
    WHERE a.tenant_id=${ctx.tenantId} AND a.tenant_user_id=${memberId}
    FOR SHARE OF a,r`)) as unknown as Assignment[]
}

/** Resolve authority before reading any approval records; use returned IDs in SQL. */
export async function approvalPropertyIds(
  tx: Database,
  ctx: RequestContext,
  fresh: RequestContext,
  permission: string,
) {
  assertCan(ctx, permission)
  assertCan(fresh, permission)
  const rows = await assignments(tx, ctx, ctx.membership!.id)
  const properties = await tx.execute(sql`SELECT id FROM hospitality_properties
    WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL FOR SHARE`)
  return properties
    .map((p) => String(p.id))
    .filter(
      (id) =>
        canSeeProperty(ctx, id) &&
        canSeeProperty(fresh, id) &&
        assignmentAllowsProperty(rows, permission, id, ctx.activeRoleId),
    )
}

/** Additional Approvals boundary, not a replacement IAM resolver or grant writer.
 * The caller must also enforce canonical effective permissions (including denies).
 * Unscoped user grants cannot manufacture permission/property provenance.
 */
export async function assertApprovalPropertyAuthority(
  tx: Database,
  ctx: RequestContext,
  memberId: string,
  permission: string,
  propertyId: string,
  activeRoleId?: string | null,
) {
  const rows = await assignments(tx, ctx, memberId)
  const permitted = assignmentAllowsProperty(rows, permission, propertyId, activeRoleId)
  if (!permitted)
    throw new Error(`Approval permission is not assigned for this property: ${permission}`)
}
