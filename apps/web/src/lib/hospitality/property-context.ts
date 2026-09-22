import { cookies } from 'next/headers'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '@beaconhs/db'
import { hospitalityProperties } from '@beaconhs/db/schema'
import type { RequestContext } from '@beaconhs/tenant'
import { assertCanAccessProperty, hospitalityPropertyWhere } from './property-access'

export const ACTIVE_HOSPITALITY_PROPERTY_COOKIE = 'active_hospitality_property'
export const ALL_PROPERTIES_CONTEXT = 'all'

/** Narrow a read transaction using the same property RLS as the request.
 * Portfolio keeps its existing permission-derived scope. The active ID must
 * come from resolveHospitalityPropertyContext; it is never an authority grant.
 */
export async function applyActiveHospitalityPropertyScope(
  ctx: RequestContext,
  tx: Database,
  activePropertyId: string | null,
) {
  if (!activePropertyId) return
  assertCanAccessProperty(ctx, activePropertyId)
  await tx.execute(sql`SELECT set_config('app.action_scope_mode', 'property', true),
    set_config('app.action_property_ids', ${JSON.stringify([activePropertyId])}, true)`)
}

type HospitalityPropertyContext = {
  activePropertyId: string | null
  properties: { id: string; name: string }[]
}

export function resolveActiveHospitalityProperty(
  properties: readonly { id: string }[],
  requested: string | undefined,
): string | null {
  if (properties.length === 1) return properties[0]?.id ?? null
  if (requested === ALL_PROPERTIES_CONTEXT || !requested) return null
  return properties.some((property) => property.id === requested) ? requested : null
}

/**
 * Resolves a presentation preference into an authorised property scope. The
 * cookie is deliberately treated as untrusted input: only properties returned
 * by the existing server-side assignment predicate can become active.
 */
export async function resolveHospitalityPropertyContext(
  ctx: RequestContext,
): Promise<HospitalityPropertyContext> {
  const properties = await ctx.db((tx) =>
    tx
      .select({ id: hospitalityProperties.id, name: hospitalityProperties.name })
      .from(hospitalityProperties)
      .where(
        and(
          eq(hospitalityProperties.tenantId, ctx.tenantId),
          isNull(hospitalityProperties.deletedAt),
          hospitalityPropertyWhere(ctx, hospitalityProperties.id),
        ),
      )
      .orderBy(asc(hospitalityProperties.name)),
  )
  const requested = (await cookies()).get(ACTIVE_HOSPITALITY_PROPERTY_COOKIE)?.value
  const activePropertyId = resolveActiveHospitalityProperty(properties, requested)
  return { activePropertyId, properties }
}
