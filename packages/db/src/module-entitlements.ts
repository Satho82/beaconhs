import { and, eq, gt, isNull, lte, or, sql, type SQLWrapper } from 'drizzle-orm'
import type { Database } from './client'
import { tenantModuleEntitlements } from './schema/hospitality'

/** Existing entitlement storage/window policy, usable within web or worker RLS transactions.
 * Missing, disabled, future and expired grants never authorize tenant work.
 */
export async function isTenantModuleEntitled(
  tx: Database,
  tenantId: string,
  moduleKey: string,
  now = new Date(),
): Promise<boolean> {
  const [grant] = await tx
    .select({
      tenantId: tenantModuleEntitlements.tenantId,
      moduleKey: tenantModuleEntitlements.moduleKey,
    })
    .from(tenantModuleEntitlements)
    .where(
      and(
        eq(tenantModuleEntitlements.tenantId, tenantId),
        eq(tenantModuleEntitlements.moduleKey, moduleKey),
        eq(tenantModuleEntitlements.state, 'enabled'),
        or(
          isNull(tenantModuleEntitlements.effectiveFrom),
          lte(tenantModuleEntitlements.effectiveFrom, now),
        ),
        or(
          isNull(tenantModuleEntitlements.effectiveUntil),
          gt(tenantModuleEntitlements.effectiveUntil, now),
        ),
      ),
    )
    .limit(1)
  return grant?.tenantId === tenantId && grant.moduleKey === moduleKey
}

/** Tenant-correlated predicate for batch scans and mixed-module queries. */
export function tenantModuleEntitlementExists(tenantId: string | SQLWrapper, moduleKey: string) {
  return sql<boolean>`exists (select 1 from ${tenantModuleEntitlements}
    where ${tenantModuleEntitlements.tenantId} = ${tenantId}
      and ${tenantModuleEntitlements.moduleKey} = ${moduleKey}
      and ${tenantModuleEntitlements.state} = 'enabled'
      and (${tenantModuleEntitlements.effectiveFrom} is null or ${tenantModuleEntitlements.effectiveFrom} <= now())
      and (${tenantModuleEntitlements.effectiveUntil} is null or ${tenantModuleEntitlements.effectiveUntil} > now()))`
}
