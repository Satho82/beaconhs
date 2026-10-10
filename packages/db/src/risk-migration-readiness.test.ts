import { describe, expect, it } from 'vitest'
import { TENANT_SCOPED_TABLES } from './rls'
import { riskMigrationTasks } from './risk-migration-readiness'

describe('0058-compatible migration maintenance', () => {
  it('retains existing-table RLS but defers new tables and catalogue installation', () => {
    const tasks = riskMigrationTasks({ families: false, versions: false })
    expect(tasks.tables).toContain('risk_assessments')
    expect(tasks.tables).toContain('risk_templates')
    expect(tasks.tables).not.toContain('risk_template_families')
    expect(tasks.tables).not.toContain('risk_assessment_versions')
    expect(tasks.installRiskLibrary).toBe(false)
  })

  it('enables the complete RLS inventory only after both tables are present', () => {
    const tasks = riskMigrationTasks({ families: true, versions: true })
    expect(tasks.tables).toEqual(TENANT_SCOPED_TABLES)
    expect(tasks.installRiskLibrary).toBe(true)
  })

  it('refuses an intermediate or indeterminate physical schema', () => {
    expect(() => riskMigrationTasks({ families: true, versions: false })).toThrow('Incomplete')
    expect(() => riskMigrationTasks(undefined)).toThrow('Incomplete')
  })
})
