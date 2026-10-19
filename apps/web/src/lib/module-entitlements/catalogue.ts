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
    key: 'approvals',
    name: 'Approvals',
    description: 'Shared property-scoped approval requests and sequential decisions.',
  },
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
    key: 'hospitality.compliance',
    name: 'Hospitality compliance',
    description: 'Hospitality inspections, evidence, verification, and compliance follow-up.',
  },
  {
    key: 'hospitality.diary',
    name: 'Hospitality operational diary',
    description: 'Operational task templates, scheduled occurrences, reminders, and escalations.',
  },
  {
    key: 'hospitality.manager-signoff',
    name: 'Hospitality manager sign-off',
    description: 'Weekly and monthly operational sign-off records.',
  },
  {
    key: 'core.diary-tasks',
    name: 'Diary and tasks',
    description: 'Operational journals, recurring tasks, reminders, and handover notes.',
  },
  {
    key: 'core.risk',
    name: 'Risk',
    description: 'Risk assessments, registers, and mitigation controls.',
  },
  {
    key: 'core.inspections',
    name: 'Inspections',
    description: 'Inspection types, records, schedules, and evidence.',
  },
  {
    key: 'core.incidents',
    name: 'Incidents',
    description: 'Incident reporting, classifications, and follow-up.',
  },
  {
    key: 'core.action-plans',
    name: 'Action plans',
    description: 'Corrective actions, ownership, due dates, and verification.',
  },
  {
    key: 'core.training',
    name: 'Training',
    description: 'Training content, assignments, records, and qualifications.',
  },
  {
    key: 'core.people',
    name: 'People',
    description: 'People, teams, roles, and workforce records.',
  },
  {
    key: 'core.handover',
    name: 'Handover',
    description: 'Operational handovers and shift continuity.',
  },
  {
    key: 'core.assets-reminders',
    name: 'Assets and reminders',
    description: 'Assets, registers, files, and scheduled reminders.',
  },
  {
    key: 'core.metering',
    name: 'Metering',
    description: 'Meters, readings, consumption, costs, and tariffs.',
  },
] as const

export type ModuleKey = (typeof MODULE_CATALOGUE)[number]['key']

type ModuleDefinition = (typeof MODULE_CATALOGUE)[number]

const MODULES_BY_KEY = new Map<ModuleKey, ModuleDefinition>(
  MODULE_CATALOGUE.map((module) => [module.key, module]),
)

export function isModuleKey(value: string): value is ModuleKey {
  return MODULES_BY_KEY.has(value as ModuleKey)
}

export function getModuleDefinition(moduleKey: ModuleKey): ModuleDefinition {
  return MODULES_BY_KEY.get(moduleKey)!
}
