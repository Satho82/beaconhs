import { inArray, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import {
  assignedPropertyIds,
  canSeeProperty,
  ForbiddenError,
  type RequestContext,
} from '@beaconhs/tenant'

/**
 * Server-side guard for every hospitality property route and mutation.
 * Tenant RLS remains the outer boundary; this only narrows access within it.
 */
export function assertCanAccessProperty(ctx: RequestContext, propertyId: string): void {
  if (!canSeeProperty(ctx, propertyId)) throw new ForbiddenError('hospitality.property.scope')
}

/**
 * Predicate for a property ID column. Undefined means tenant-wide access.
 * An empty property assignment deliberately returns false.
 */
export function hospitalityPropertyWhere(
  ctx: RequestContext,
  propertyColumn: PgColumn,
): SQL | undefined {
  const propertyIds = assignedPropertyIds(ctx)
  if (propertyIds === null) return undefined
  if (propertyIds.length === 0) return sql`false`
  return inArray(propertyColumn, propertyIds)
}
