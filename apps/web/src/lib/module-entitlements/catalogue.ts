/**
 * The commercial module catalogue. These keys are deliberately independent of
 * navigation and routes: a hidden navigation item is not an authorization
 * decision, and a route may require more than one module in future.
 *
 * Entitlements are tenant-scoped in the MVP. The persistence model can later
 * resolve a group plan and property overrides into the same effective keys
 * without changing callers of this catalogue.
 */
export const MODULE_CATALOGUE = [
  {
    key: 'hospitality.properties',
    name: 'Hospitality properties',
    description: 'Properties, buildings, floors, rooms, apartments, and room QR targets.',
  },
  {
    key: 'hospitality.maintenance',
    name: 'Hospitality maintenance',
    description: 'Room and hospitality-asset issues, work orders, evidence, and verification.',
  },
  {
    key: 'hospitality.operations',
    name: 'Hospitality operations',
    description: 'Operational task templates, scheduled occurrences, reminders, and escalations.',
  },
  {
    key: 'hospitality.manager-signoff',
    name: 'Hospitality manager sign-off',
    description: 'Weekly and monthly operational sign-off records.',
  },
] as const

export type ModuleKey = (typeof MODULE_CATALOGUE)[number]['key']

export type ModuleDefinition = (typeof MODULE_CATALOGUE)[number]

const MODULES_BY_KEY = new Map<ModuleKey, ModuleDefinition>(
  MODULE_CATALOGUE.map((module) => [module.key, module]),
)

export function isModuleKey(value: string): value is ModuleKey {
  return MODULES_BY_KEY.has(value as ModuleKey)
}

export function getModuleDefinition(moduleKey: ModuleKey): ModuleDefinition {
  return MODULES_BY_KEY.get(moduleKey)!
}

