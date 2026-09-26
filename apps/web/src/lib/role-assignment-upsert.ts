import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import { hospitalityProperties, roleAssignments, roles, type RoleScope } from '@beaconhs/db/schema'
import { isUuid } from './list-params'
import {
  assertDelegablePermissions,
  assertDelegableScope,
  assertManageableMember,
  type DelegationActor,
} from './access-delegation'

type RoleAssignmentUpsert = {
  tenantId: string
  tenantUserId: string
  roleId: string
  scope: RoleScope
}

/**
 * Set one or more member/role assignments atomically.
 *
 * Re-selecting an existing role means "replace its scope" throughout the
 * administration UI. The database enforces one row per
 * (tenant, member, role), so every writer must use the same conflict target
 * instead of a check-then-insert branch that can race with another request.
 */
export async function upsertRoleAssignments(
  actor: DelegationActor,
  tx: Database,
  assignments: readonly RoleAssignmentUpsert[],
): Promise<string[]> {
  if (assignments.length === 0) return []

  for (const assignment of assignments) {
    assertDelegableScope(actor, assignment.tenantId, assignment.scope)
    await assertManageableMember(tx, actor, assignment.tenantId, assignment.tenantUserId)
    if (!actor.isSuperAdmin) {
      const [role] = await tx
        .select({ permissions: roles.permissions })
        .from(roles)
        .where(and(eq(roles.id, assignment.roleId), eq(roles.tenantId, assignment.tenantId)))
        .limit(1)
      if (!role) throw new Error('Role does not belong to the user’s tenant.')
      assertDelegablePermissions(actor, role.permissions)
    }
  }

  // JSON scope IDs have no foreign key. Validate every property against the
  // assignment tenant even when the caller uses the platform-admin connection.
  // An empty selection is valid and deliberately grants no property access.
  const propertiesByTenant = new Map<string, Set<string>>()
  for (const assignment of assignments) {
    if (assignment.scope.type !== 'properties') continue
    const ids = propertiesByTenant.get(assignment.tenantId) ?? new Set<string>()
    for (const id of assignment.scope.propertyIds) {
      if (!isUuid(id)) throw new Error('Invalid property assignment.')
      ids.add(id)
    }
    propertiesByTenant.set(assignment.tenantId, ids)
  }
  for (const [tenantId, ids] of propertiesByTenant) {
    if (ids.size === 0) continue
    const properties = await tx
      .select({ id: hospitalityProperties.id })
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, tenantId),
          inArray(hospitalityProperties.id, [...ids]),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .for('share')
    if (properties.length !== ids.size) {
      throw new Error('Selected properties must be active and belong to the user’s tenant.')
    }
  }

  const rows = await tx
    .insert(roleAssignments)
    .values([...assignments])
    .onConflictDoUpdate({
      target: [roleAssignments.tenantId, roleAssignments.tenantUserId, roleAssignments.roleId],
      set: {
        scope: sql`excluded.scope`,
        updatedAt: sql`now()`,
      },
      // A repeated save of the same scope is a real no-op. PostgreSQL omits it
      // from RETURNING, which lets callers avoid false "changed" notices and
      // audit entries while remaining race-safe.
      setWhere: sql`${roleAssignments.scope} IS DISTINCT FROM excluded.scope`,
    })
    .returning({ membershipId: roleAssignments.tenantUserId })

  return rows.map((row) => row.membershipId)
}
