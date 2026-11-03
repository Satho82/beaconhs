import { can, type RequestContext } from '@beaconhs/tenant'
import type { ModuleKey } from '@/lib/module-entitlements/catalogue'

/** The overview must not grant access merely because a user can see reports. */
export function overviewAccess(
  ctx: Pick<RequestContext, 'isSuperAdmin' | 'permissions'>,
  modules: ReadonlySet<ModuleKey>,
) {
  return {
    maintenance: modules.has('hospitality.maintenance') && can(ctx, 'maintenance.read'),
    metering: modules.has('core.metering') && can(ctx, 'hospitality.read'),
    actions:
      modules.has('core.action-plans') && (can(ctx, 'ca.read.all') || can(ctx, 'ca.read.site')),
    training: modules.has('core.training') && can(ctx, 'training.read.all'),
  }
}
