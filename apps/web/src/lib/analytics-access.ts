import 'server-only'

import { asc, isNull } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import { formTemplates, type BhqlQuery } from '@beaconhs/db/schema'
import type { AnalyticsEntity, BhqlResult } from '@beaconhs/analytics'
import {
  addTrustedSystemAppResponsesEntity,
  discoverEntitiesWithScopedApps,
  runBhql,
} from '@beaconhs/analytics/server'
import { actionPropertyScope, type RequestContext } from '@beaconhs/tenant'
import { getEffectiveRoleKeys } from './effective-roles'
import {
  applyActiveHospitalityPropertyScope,
  resolveHospitalityPropertyContext,
} from './hospitality/property-context'
import {
  accessibleAnalyticsTemplates,
  analyticsAccessScopeKey,
  removeRawBuilderEntities,
} from './analytics-access-policy'

type AnalyticsAccess = {
  entities: AnalyticsEntity[]
  entityMap: Record<string, AnalyticsEntity>
  scopeKey: string
}

/** Resolve the canonical fail-closed catalog inside the caller's tenant tx. */
export async function resolveAnalyticsAccess(
  ctx: RequestContext,
  tx: Database,
  options: { activePropertyId?: string | null } = {},
): Promise<AnalyticsAccess> {
  const [templates, roleKeys] = await Promise.all([
    tx
      .select({
        id: formTemplates.id,
        name: formTemplates.name,
        status: formTemplates.status,
        allowedRoles: formTemplates.allowedRoles,
        deletedAt: formTemplates.deletedAt,
      })
      .from(formTemplates)
      .where(isNull(formTemplates.deletedAt))
      .orderBy(asc(formTemplates.name)),
    getEffectiveRoleKeys(ctx, tx),
  ])
  const accessible = accessibleAnalyticsTemplates(ctx, templates, roleKeys)
  const propertyScope = actionPropertyScope(ctx)
  const entities = removeRawBuilderEntities(
    await discoverEntitiesWithScopedApps(
      tx,
      accessible.map(({ id, name }) => ({ id, name })),
      { propertyScopeMode: propertyScope.mode },
    ),
  )
  return {
    entities,
    entityMap: Object.fromEntries(entities.map((entity) => [entity.key, entity])),
    scopeKey: analyticsAccessScopeKey({
      activeRoleId: ctx.activeRoleId,
      effectiveRoleKeys: roleKeys,
      templateIds: accessible.map((template) => template.id),
      propertyScopeMode: propertyScope.mode,
      assignedPropertyIds: propertyScope.propertyIds,
      activePropertyId: options.activePropertyId ?? null,
    }),
  }
}

export async function runAuthorizedBhql(
  ctx: RequestContext,
  query: BhqlQuery | unknown,
  opts: { maxRows?: number; trustedSystemCard?: boolean } = {},
): Promise<BhqlResult> {
  const { activePropertyId } = await resolveHospitalityPropertyContext(ctx)
  return ctx.db(async (tx) => {
    await applyActiveHospitalityPropertyScope(ctx, tx, activePropertyId)
    const access = await resolveAnalyticsAccess(ctx, tx, { activePropertyId })
    const entityMap = opts.trustedSystemCard
      ? addTrustedSystemAppResponsesEntity(access.entityMap)
      : access.entityMap
    return runBhql(tx, query, { maxRows: opts.maxRows, entityMap })
  })
}
