import type { ModuleKey } from '../module-entitlements/catalogue'

// Navigation is deliberately only a presentation layer. This mapping keeps a
// disabled module out of the tenant shell while the route and service guards
// remain the authority for every request and mutation.
const NAV_MODULE_ENTITLEMENTS: Partial<Record<string, ModuleKey>> = {
  hospitality: 'hospitality.properties',
}

export function isNavModuleEntitled(
  moduleKey: string,
  entitledModules: ReadonlySet<ModuleKey>,
): boolean {
  const requiredEntitlement = NAV_MODULE_ENTITLEMENTS[moduleKey]
  return !requiredEntitlement || entitledModules.has(requiredEntitlement)
}
