import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { auditLog, tenantModuleEntitlements, tenants } from '@beaconhs/db/schema'
import type { PlatformOperator } from '@/lib/auth'
import { normalizeEntitlementChange, type EntitlementChange } from './policy'

/**
 * Platform-only read. The tenant id is deliberately an argument only here,
 * never in tenant-facing guards, and the target tenant is verified before a
 * result is returned. Tenant administrators therefore cannot self-enable a
 * licensed hospitality capability by posting a different tenant id.
 */
export async function listTenantModuleEntitlements(operator: PlatformOperator, tenantId: string) {
  return withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) throw new Error('Tenant not found.')
    const rows = await tx
      .select()
      .from(tenantModuleEntitlements)
      .where(eq(tenantModuleEntitlements.tenantId, tenantId))
      .orderBy(tenantModuleEntitlements.moduleKey)
    return { tenant, rows }
  })
}

/** Platform-only enable/disable path. It cannot be called through a tenant RLS context. */
export async function setTenantModuleEntitlement(
  operator: PlatformOperator,
  tenantId: string,
  input: EntitlementChange,
) {
  const change = normalizeEntitlementChange(input)
  return withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) throw new Error('Tenant not found.')
    const [before] = await tx
      .select()
      .from(tenantModuleEntitlements)
      .where(
        and(
          eq(tenantModuleEntitlements.tenantId, tenantId),
          eq(tenantModuleEntitlements.moduleKey, change.moduleKey),
        ),
      )
      .limit(1)
    const [row] = await tx
      .insert(tenantModuleEntitlements)
      .values({ tenantId, ...change, changedByUserId: operator.userId })
      .onConflictDoUpdate({
        target: [tenantModuleEntitlements.tenantId, tenantModuleEntitlements.moduleKey],
        set: { ...change, changedByUserId: operator.userId, updatedAt: new Date() },
      })
      .returning()
    if (!row) throw new Error('Unable to save module entitlement.')
    await tx.insert(auditLog).values({
      tenantId,
      actorUserId: operator.userId,
      entityType: 'tenant_module_entitlement',
      entityId: row.id,
      action: 'update',
      summary: `${change.state === 'enabled' ? 'Enabled' : 'Disabled'} ${change.moduleKey}`,
      before: before
        ? {
            state: before.state,
            effectiveFrom: before.effectiveFrom?.toISOString() ?? null,
            effectiveUntil: before.effectiveUntil?.toISOString() ?? null,
          }
        : null,
      after: {
        state: row.state,
        effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
        effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
      },
      metadata: { moduleKey: change.moduleKey, platformControlled: true },
    })
    return row
  })
}
