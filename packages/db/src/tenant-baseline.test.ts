import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILTIN_ROLES } from './schema'
import {
  buildTenantBaselinePlan,
  STANDARD_INCIDENT_CLASSIFICATIONS,
  STANDARD_OPERATIONAL_TASK_TEMPLATES,
} from './tenant-baseline'

describe('tenant baseline provisioning plan', () => {
  it('provides tenant-neutral roles, module offerings, and incident reference data', () => {
    const plan = buildTenantBaselinePlan([
      'hospitality.properties',
      'hospitality.maintenance',
      'hospitality.properties',
    ])

    expect(plan.roles.map((role) => role.key)).toEqual(Object.keys(BUILTIN_ROLES))
    expect(plan.entitlements).toEqual([
      { moduleKey: 'hospitality.properties', state: 'disabled' },
      { moduleKey: 'hospitality.maintenance', state: 'disabled' },
    ])
    expect(plan.incidentClassifications).toEqual(STANDARD_INCIDENT_CLASSIFICATIONS)
    expect(plan.operationalTaskTemplates).toEqual(STANDARD_OPERATIONAL_TASK_TEMPLATES)
  })

  it('uses stable identities and insert-only operations, so reruns preserve tenant changes', () => {
    const source = readFileSync(new URL('./tenant-baseline.ts', import.meta.url), 'utf8')
    expect(source).toContain('onConflictDoNothing({ target: [roles.tenantId, roles.key] })')
    expect(source).toContain(
      'tenantModuleEntitlements.tenantId, tenantModuleEntitlements.moduleKey',
    )
    expect(source).toContain('seedReportDefinitionsForTenant')
    expect(source).toContain('seedCanonicalTemplatesForTenant')
  })

  it('never creates demo fixtures or property- and people-scoped operational data', () => {
    const source = readFileSync(new URL('./tenant-baseline.ts', import.meta.url), 'utf8')
    for (const forbidden of [
      'hospitalityProperties',
      'hospitalityRooms',
      'tenantUsers',
      'maintenanceIssues',
      'operationalTaskSchedules',
      'operationalTaskOccurrences',
      'inspectionRecords',
      'seed-demo',
      'seed-cycas',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })
})
