import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./forms-governance.ts', import.meta.url), 'utf8')

describe('platform form-template materialisation boundary', () => {
  it('requires an authorised published forms-domain source and validates executable schema', () => {
    expect(source).toContain("eq(configurationMasters.domainType, 'form_template')")
    expect(source).toContain("eq(configurationMasterVersions.state, 'published')")
    expect(source).toContain('validateFormSchema(candidate.schema)')
    expect(source).toContain('assertTenantModuleEntitled(ctx, payload.formTemplate.moduleKey)')
  })

  it('creates new tenant-owned operational identity and immutable initial version', () => {
    expect(source).toContain('.insert(formTemplates)')
    expect(source).toContain('tenantId: ctx.tenantId')
    expect(source).toContain("status: 'published'")
    expect(source).toContain('.insert(formTemplateVersions)')
    expect(source).toContain('version: 1')
    expect(source).toContain('schema: payload.formTemplate.schema')
  })

  it('keeps governance lineage, property applicability, and audit inside the materialisation', () => {
    expect(source).toContain('sourceMasterVersionId: source.version.id')
    expect(source).toContain('.insert(tenantConfigurationFormTemplates)')
    expect(source).toContain('.insert(tenantConfigurationPropertyApplicability)')
    expect(source).toContain('assertCanAccessProperty(ctx, propertyId)')
    expect(source).toContain('await recordAuditInTransaction(tx, ctx, {')
    expect(source).toContain('formTemplateVersionId: templateVersion.id')
  })

  it('rejects duplicate adoption before materialising another tenant form', () => {
    expect(source).toContain('This platform configuration version has already been adopted.')
    expect(source).toContain('eq(tenantConfigurations.tenantId, ctx.tenantId)')
  })
})
