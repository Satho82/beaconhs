import { and, eq } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import {
  PERMISSION_CATALOGUE,
  roleAssignments,
  roles,
  tenantUsers,
  users,
  type RoleScope,
} from '@beaconhs/db/schema'
import { can, ForbiddenError, resolveMembershipAccess, type RequestContext } from '@beaconhs/tenant'

export type DelegationActor =
  | Pick<RequestContext, 'isSuperAdmin' | 'tenantId' | 'scopes' | 'permissions'>
  | { isSuperAdmin: true }

export function assertDelegablePermissions(actor: DelegationActor, permissions: readonly string[]) {
  if (actor.isSuperAdmin) return
  for (const permission of permissions) {
    const expanded = PERMISSION_CATALOGUE.filter(
      (key) =>
        permission === '*' ||
        (permission.endsWith('.*') ? key.startsWith(permission.slice(0, -1)) : key === permission),
    )
    if (
      !expanded.length ||
      permission.startsWith('platform.') ||
      expanded.some((key) => key.startsWith('platform.') || !can(actor, key))
    ) {
      throw new ForbiddenError('admin.delegation.permissions')
    }
  }
}

export function assertDelegableScope(actor: DelegationActor, tenantId: string, scope: RoleScope) {
  if (actor.isSuperAdmin) return
  if (actor.tenantId !== tenantId) throw new ForbiddenError('admin.delegation.tenant')
  if (actor.scopes.some((assigned) => assigned.type === 'tenant')) return
  const allowed = (type: RoleScope['type'], key: string, ids: string[]) => {
    const available = new Set(
      actor.scopes
        .filter((entry) => entry.type === type)
        .flatMap((entry) => (entry as unknown as Record<string, string[]>)[key] ?? []),
    )
    return ids.every((id) => available.has(id))
  }
  let permitted = false
  switch (scope.type) {
    case 'properties':
      permitted = allowed('properties', 'propertyIds', scope.propertyIds)
      break
    case 'sites':
      permitted =
        !actor.scopes.some((s) => s.type === 'properties') &&
        allowed('sites', 'siteIds', scope.siteIds)
      break
    case 'people':
      permitted =
        !actor.scopes.some((s) => s.type === 'properties') &&
        allowed('people', 'personIds', scope.personIds)
      break
    case 'crews':
      permitted =
        !actor.scopes.some((s) => s.type === 'properties') &&
        allowed('crews', 'crewIds', scope.crewIds)
      break
    case 'team':
      permitted =
        !actor.scopes.some((s) => s.type === 'properties') &&
        allowed('team', 'departmentIds', scope.departmentIds) &&
        allowed('team', 'groupIds', scope.groupIds)
      break
    case 'self':
      permitted = !actor.scopes.some((s) => s.type === 'properties')
      break
    case 'tenant':
      permitted = false
  }
  if (!permitted) throw new ForbiddenError('admin.delegation.scope')
}

/** Check the target's existing authority too: replacing/removing a scope is
 * not a way to take control of an otherwise unmanageable account.
 */
export async function assertManageableMember(
  tx: Database,
  actor: DelegationActor,
  tenantId: string,
  membershipId: string,
) {
  if (actor.isSuperAdmin) return
  if (actor.tenantId !== tenantId) throw new ForbiddenError('admin.delegation.tenant')
  const [member] = await tx
    .select({ id: tenantUsers.id, isSuperAdmin: users.isSuperAdmin })
    .from(tenantUsers)
    .innerJoin(users, eq(users.id, tenantUsers.userId))
    .where(and(eq(tenantUsers.id, membershipId), eq(tenantUsers.tenantId, tenantId)))
    .limit(1)
  if (!member || member.isSuperAdmin) throw new ForbiddenError('admin.delegation.member')
  const access = await resolveMembershipAccess(tx, membershipId)
  for (const scope of access.scopes) assertDelegableScope(actor, tenantId, scope)
  assertDelegablePermissions(actor, [...access.permissions])
}

export async function assertManageableRole(
  tx: Database,
  actor: DelegationActor,
  tenantId: string,
  roleId: string,
) {
  const [role] = await tx
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
    .limit(1)
  if (!role) throw new ForbiddenError('admin.delegation.role')
  assertDelegablePermissions(actor, role.permissions)
  const members = await tx
    .select({ id: roleAssignments.tenantUserId })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.roleId, roleId), eq(roleAssignments.tenantId, tenantId)))
  for (const member of members) await assertManageableMember(tx, actor, tenantId, member.id)
}
