import { and, eq, sql, type SQL } from 'drizzle-orm'
import { reportSchedules } from '@beaconhs/db/schema'
import { actionPropertyScope, type RequestContext } from '@beaconhs/tenant'

/** Property-restricted principals may manage only schedules they run as. */
export function reportScheduleAccessWhere(
  ctx: RequestContext,
  ...conditions: Array<SQL | undefined>
): SQL | undefined {
  const owner =
    actionPropertyScope(ctx).mode === 'tenant'
      ? undefined
      : ctx.membership
        ? eq(reportSchedules.runAsTenantUserId, ctx.membership.id)
        : sql`false`
  return and(...conditions, owner)
}
