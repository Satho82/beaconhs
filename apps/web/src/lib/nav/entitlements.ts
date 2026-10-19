import type { ModuleKey } from '../module-entitlements/catalogue'
const NAV_MODULE_ENTITLEMENTS: Partial<Record<string, ModuleKey>> = {
  hospitality: 'hospitality.properties',
  compliance: 'hospitality.compliance',
  'hospitality-maintenance': 'hospitality.maintenance',
  approvals: 'approvals',
  journals: 'core.diary-tasks',
  'hospitality-risk': 'core.risk',
  inspections: 'core.inspections',
  incidents: 'core.incidents',
  'corrective-actions': 'core.action-plans',
  training: 'core.training',
  people: 'core.people',
  'hospitality-handover': 'core.handover',
  equipment: 'core.assets-reminders',
  'hospitality-metering': 'core.metering',
}
const DEFAULT_ENABLED_MODULES = new Set<ModuleKey>([
  'core.diary-tasks',
  'core.risk',
  'core.inspections',
  'core.incidents',
  'core.action-plans',
  'core.training',
  'core.people',
  'core.handover',
  'core.assets-reminders',
  'core.metering',
])

export function isNavModuleEntitled(
  moduleKey: string,
  entitledModules: ReadonlySet<ModuleKey>,
  configuredModules: ReadonlySet<ModuleKey> = new Set(),
): boolean {
  const requiredEntitlement = NAV_MODULE_ENTITLEMENTS[moduleKey]
  if (!requiredEntitlement || entitledModules.has(requiredEntitlement)) return true
  // Newly introduced core modules remain visible to existing tenants until a
  // Platform Admin explicitly saves their entitlement. That preserves service
  // continuity while still making the saved Enabled/Disabled state authoritative.
  return (
    DEFAULT_ENABLED_MODULES.has(requiredEntitlement) && !configuredModules.has(requiredEntitlement)
  )
}
