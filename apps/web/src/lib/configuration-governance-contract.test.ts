import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./configuration-governance.ts', import.meta.url), 'utf8')
const rls = readFileSync(new URL('../../../../packages/db/src/rls.ts', import.meta.url), 'utf8')

describe('V1.4 configuration governance boundary', () => {
  it('adopts a published master by copying payload rather than mutating the master', () => {
    expect(source).toContain("eq(configurationMasterVersions.state, 'published')")
    expect(source).toContain('payload: structuredClone(source.version.payload)')
    expect(source).toContain('sourceMasterVersionId: source.version.id')
  })

  it('requires tenant settings authority and audits adoption, applicability and forms binding', () => {
    expect(source.match(/assertCan\(ctx, 'admin\.settings\.manage'\)/g)).toHaveLength(3)
    expect(source).toContain('summary: `Adopted platform configuration ${source.master.key}`')
    expect(source).toContain("summary: 'Updated configuration property applicability'")
    expect(source).toContain("summary: 'Bound configuration to an existing form template'")
  })

  it('enforces property authority and keeps forms as a binding, not a migration', () => {
    expect(source).toContain('assertCanAccessProperty(ctx, propertyId)')
    expect(source).toContain('tenantConfigurationFormTemplates')
    expect(source).toContain('Configuration and form template must belong to this tenant.')
  })

  it('registers every new tenant-owned governance table for RLS', () => {
    for (const table of [
      'tenant_configurations',
      'tenant_configuration_versions',
      'tenant_configuration_property_applicability',
      'tenant_configuration_form_templates',
    ])
      expect(rls).toContain(`'${table}'`)
  })
})
