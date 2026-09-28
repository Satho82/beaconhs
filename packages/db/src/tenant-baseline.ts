import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from './client'
import { seedCanonicalTemplatesForTenant } from './canonical-templates'
import { installStandardRiskLibrary } from './risk-library-install'
import {
  BUILTIN_ROLES,
  incidentClassifications,
  operationalTaskTemplates,
  roles,
  tenantModuleEntitlements,
} from './schema'
import { seedLiftPlanTemplate } from './seed/lift-plan-template'
import { seedReportDefinitionsForTenant } from './seed/report-definitions'
import { seedToolboxTemplate } from './seed/toolbox-template'

type BaselineTx = Pick<Database, 'select' | 'insert' | 'update'>

export type TenantBaselineInput = {
  tenantId: string
  /** The platform catalogue is supplied by the application layer. */
  moduleKeys: readonly string[]
  changedByUserId?: string | null
}

export type TenantBaselineResult = {
  changed: boolean
  rolesAdded: number
  modulesAdded: number
  formsAdded: number
  classificationsAdded: number
  taskTemplatesAdded: number
}

export const STANDARD_INCIDENT_CLASSIFICATIONS = [
  { name: 'Injury', code: 'INJ', description: 'Personal injury.', isRecordable: 1, sortOrder: 10 },
  {
    name: 'Illness',
    code: 'ILL',
    description: 'Occupational illness.',
    isRecordable: 1,
    sortOrder: 20,
  },
  {
    name: 'Near miss',
    code: 'NM',
    description: 'No injury; loss potential.',
    isRecordable: 0,
    sortOrder: 30,
  },
  {
    name: 'Property damage',
    code: 'PD',
    description: 'Damage to property, equipment, or infrastructure.',
    isRecordable: 0,
    sortOrder: 40,
  },
  {
    name: 'Environmental',
    code: 'ENV',
    description: 'Spill, release, or emission.',
    isRecordable: 0,
    sortOrder: 50,
  },
] as const

// Deliberately templates only. Schedules require a real tenant property and
// must be configured with that property's time zone and accountable owner.
export const STANDARD_OPERATIONAL_TASK_TEMPLATES = [
  { title: 'Fire alarm panel daily check', requiresEvidence: false },
  { title: 'Plant room morning inspection', requiresEvidence: true },
  { title: 'Guest corridor safety walk', requiresEvidence: true },
  { title: 'Domestic hot water temperature check', requiresEvidence: true },
  { title: 'Emergency lighting spot check', requiresEvidence: false },
  { title: 'Lift alarm communication test', requiresEvidence: true },
  { title: 'Guest room fire-door inspection', requiresEvidence: true },
] as const

export function buildTenantBaselinePlan(moduleKeys: readonly string[]) {
  return {
    roles: Object.entries(BUILTIN_ROLES).map(([key, role]) => ({ key, ...role })),
    // Offer every recognised module without silently granting optional paid
    // capability. Platform Control Centre owns the subsequent enablement.
    entitlements: [...new Set(moduleKeys)].map((moduleKey) => ({
      moduleKey,
      state: 'disabled' as const,
    })),
    incidentClassifications: STANDARD_INCIDENT_CLASSIFICATIONS,
    operationalTaskTemplates: STANDARD_OPERATIONAL_TASK_TEMPLATES,
  }
}

/**
 * Idempotent, tenant-neutral day-one provisioning. It installs only shared
 * configuration and reference data; it never creates people, properties,
 * rooms, operational occurrences, completed records, or tenant history.
 */
export async function provisionTenantBaseline(
  tx: BaselineTx,
  input: TenantBaselineInput,
): Promise<TenantBaselineResult> {
  await installStandardRiskLibrary(tx)
  const plan = buildTenantBaselinePlan(input.moduleKeys)

  let rolesAdded = 0
  for (const role of plan.roles) {
    const inserted = await tx
      .insert(roles)
      .values({
        tenantId: input.tenantId,
        key: role.key,
        name: role.name,
        description: role.description,
        isBuiltIn: true,
        permissions: role.permissions,
      })
      .onConflictDoNothing({ target: [roles.tenantId, roles.key] })
      .returning({ id: roles.id })
    if (inserted[0]) rolesAdded += 1
  }

  let modulesAdded = 0
  for (const entitlement of plan.entitlements) {
    const inserted = await tx
      .insert(tenantModuleEntitlements)
      .values({
        tenantId: input.tenantId,
        moduleKey: entitlement.moduleKey,
        // Catalogue availability is explicit, but commercial enablement stays
        // a Platform Super Admin decision rather than silently granting paid
        // modules to every new tenant.
        state: 'disabled',
        changedByUserId: input.changedByUserId ?? null,
      })
      .onConflictDoNothing({
        target: [tenantModuleEntitlements.tenantId, tenantModuleEntitlements.moduleKey],
      })
      .returning({ id: tenantModuleEntitlements.id })
    if (inserted[0]) modulesAdded += 1
  }

  let classificationsAdded = 0
  for (const classification of plan.incidentClassifications) {
    const existing = await tx
      .select({ id: incidentClassifications.id })
      .from(incidentClassifications)
      .where(
        and(
          eq(incidentClassifications.tenantId, input.tenantId),
          isNull(incidentClassifications.parentId),
          eq(incidentClassifications.code, classification.code),
        ),
      )
      .limit(1)
    if (existing[0]) continue
    const inserted = await tx
      .insert(incidentClassifications)
      .values({ tenantId: input.tenantId, ...classification })
      .returning({ id: incidentClassifications.id })
    if (inserted[0]) classificationsAdded += 1
  }

  let taskTemplatesAdded = 0
  for (const template of plan.operationalTaskTemplates) {
    const existing = await tx
      .select({ id: operationalTaskTemplates.id })
      .from(operationalTaskTemplates)
      .where(
        and(
          eq(operationalTaskTemplates.tenantId, input.tenantId),
          eq(operationalTaskTemplates.title, template.title),
          isNull(operationalTaskTemplates.deletedAt),
        ),
      )
      .limit(1)
    if (existing[0]) continue
    const inserted = await tx
      .insert(operationalTaskTemplates)
      .values({
        tenantId: input.tenantId,
        title: template.title,
        instructions: `Configure this standard check for each applicable property and record any exception.`,
        requiresEvidence: template.requiresEvidence,
      })
      .returning({ id: operationalTaskTemplates.id })
    if (inserted[0]) taskTemplatesAdded += 1
  }

  const canonicalForms = await seedCanonicalTemplatesForTenant(tx, input.tenantId)
  const liftPlan = await seedLiftPlanTemplate(tx, input.tenantId)
  const toolboxTalk = await seedToolboxTemplate(tx, input.tenantId)
  await seedReportDefinitionsForTenant(tx, input.tenantId)

  const formsAdded =
    canonicalForms +
    (liftPlan === 'inserted' || liftPlan === 'restored' ? 1 : 0) +
    (toolboxTalk === 'inserted' ? 1 : 0)
  return {
    changed: rolesAdded + modulesAdded + classificationsAdded + taskTemplatesAdded + formsAdded > 0,
    rolesAdded,
    modulesAdded,
    formsAdded,
    classificationsAdded,
    taskTemplatesAdded,
  }
}
