import type { ModuleKey } from '../module-entitlements/catalogue'
const NAV_MODULE_ENTITLEMENTS: Partial<Record<string, ModuleKey>> = {
  hospitality: 'hospitality.properties',
  compliance: 'hospitality.compliance',
  'hospitality-maintenance': 'hospitality.maintenance',
  approvals: 'approvals',
}
export function isNavModuleEntitled(
  moduleKey: string,
  entitledModules: ReadonlySet<ModuleKey>,
): boolean {
  const requiredEntitlement = NAV_MODULE_ENTITLEMENTS[moduleKey]
  return !requiredEntitlement || entitledModules.has(requiredEntitlement)
}
