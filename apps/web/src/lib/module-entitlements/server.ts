import 'server-only'

import { and, eq, gt, isNull, lte, or } from 'drizzle-orm'
import { tenantModuleEntitlements } from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'
import {
  assertModuleEntitled,
  effectiveModuleKeys,
  ModuleNotEntitledError,
} from './policy'
import type { ModuleKey } from './catalogue'

type EntitlementWindow = {
  state: 'enabled' | 'disabled'
  effectiveFrom: Date | null
  effectiveUntil: Date | null
}

/**
 * Applies the temporal entitlement rule consistently to storage and future
 * plan/property resolvers. The ending instant is exclusive, so adjacent plans
 * cannot both be effective at the same moment.
 */
export function isEntitlementEffective(row: EntitlementWindow, now: Date): boolean {
  return (
    row.state === 'enabled' &&
    (row.effectiveFrom === null || row.effectiveFrom <= now) &&
    (row.effectiveUntil === null || row.effectiveUntil > now)
  )
}

/**
 * Reads effective tenant entitlements using the RequestContext-bound database.
 * This is intentionally not a super-admin read: RLS remains a second line of
 * tenant isolation even if a caller passes a mismatched tenant identifier.
 */
export async function loadEnabledModuleKeys(
  ctx: RequestContext,
  now = new Date(),
): Promise<Set<ModuleKey>> {
  const rows = await ctx.db((tx) =>
    tx
      .select({
        moduleKey: tenantModuleEntitlements.moduleKey,
        state: tenantModuleEntitlements.state,
        effectiveFrom: tenantModuleEntitlements.effectiveFrom,
        effectiveUntil: tenantModuleEntitlements.effectiveUntil,
      })
      .from(tenantModuleEntitlements)
      .where(
        and(
          eq(tenantModuleEntitlements.tenantId, ctx.tenantId),
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
      ),
  )

  // Keep the pure rule here too, so a future resolver that broadens the query
  // cannot accidentally make an expired or disabled module effective.
  return effectiveModuleKeys(
    rows
      .filter((row) => isEntitlementEffective(row, now))
      .map((row) => row.moduleKey),
  )
}

/** Server guard for every protected hospitality route, action, and API handler. */
export async function assertTenantModuleEntitled(
  ctx: RequestContext,
  moduleKey: ModuleKey,
  now = new Date(),
): Promise<void> {
  assertModuleEntitled([...await loadEnabledModuleKeys(ctx, now)], moduleKey)
}

export { ModuleNotEntitledError }
