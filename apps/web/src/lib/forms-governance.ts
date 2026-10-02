import 'server-only'

import { validateFormSchema } from '@beaconhs/forms-core'
import { and, eq } from 'drizzle-orm'
import {
  configurationMasterVersions,
  configurationMasters,
  formTemplateVersions,
  formTemplates,
  tenantConfigurationFormTemplates,
  tenantConfigurationPropertyApplicability,
  tenantConfigurations,
  tenantConfigurationVersions,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from './audit'
import { assertCanAccessProperty } from './hospitality/property-access'
import { isModuleKey } from './module-entitlements/catalogue'
import { assertTenantModuleEntitled } from './module-entitlements/server'

type PlatformFormTemplatePayload = {
  formTemplate: {
    key: string
    name: string
    schema: unknown
    category?: string
    description?: string
    kind?: 'form' | 'wizard' | 'checklist' | 'register' | 'mini_app'
    iconKey?: string
    allowedRoles?: string[]
    moduleBinding?: string
    moduleKey?: string
    emailOnSubmit?: boolean
    surfaceAsTool?: boolean
    recordConfig?: Record<string, unknown>
  }
}

const templateKeyPattern = /^[a-z][a-z0-9._-]{1,96}$/

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} is required.`)
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) throw new Error(`${field} is invalid.`)
  return trimmed
}

function parsePlatformFormTemplatePayload(value: Record<string, unknown>): PlatformFormTemplatePayload {
  const formTemplate = value.formTemplate
  if (!formTemplate || typeof formTemplate !== 'object' || Array.isArray(formTemplate)) {
    throw new Error('Published configuration is not a supported forms-domain template.')
  }
  const candidate = formTemplate as Record<string, unknown>
  const key = requiredText(candidate.key, 'Template key', 97)
  if (!templateKeyPattern.test(key)) throw new Error('Template key must be a stable lowercase key.')
  const name = requiredText(candidate.name, 'Template name', 160)
  const schema = validateFormSchema(candidate.schema)
  const kind = candidate.kind
  if (kind && !['form', 'wizard', 'checklist', 'register', 'mini_app'].includes(kind as string)) {
    throw new Error('Template kind is not supported.')
  }
  const allowedRoles = candidate.allowedRoles
  if (allowedRoles && (!Array.isArray(allowedRoles) || allowedRoles.some((role) => typeof role !== 'string'))) {
    throw new Error('Template allowed roles are invalid.')
  }
  const moduleKey = candidate.moduleKey
  if (moduleKey && (typeof moduleKey !== 'string' || !isModuleKey(moduleKey))) {
    throw new Error('Template module entitlement is invalid.')
  }

  return {
    formTemplate: {
      key,
      name,
      schema,
      category: typeof candidate.category === 'string' ? candidate.category.trim() || undefined : undefined,
      description:
        typeof candidate.description === 'string' ? candidate.description.trim() || undefined : undefined,
      kind: kind as PlatformFormTemplatePayload['formTemplate']['kind'],
      iconKey: typeof candidate.iconKey === 'string' ? candidate.iconKey.trim() || undefined : undefined,
      allowedRoles: allowedRoles as string[] | undefined,
      moduleBinding:
        typeof candidate.moduleBinding === 'string' ? candidate.moduleBinding.trim() || undefined : undefined,
      moduleKey,
      emailOnSubmit: candidate.emailOnSubmit === true,
      surfaceAsTool: candidate.surfaceAsTool === true,
      recordConfig:
        candidate.recordConfig &&
        typeof candidate.recordConfig === 'object' &&
        !Array.isArray(candidate.recordConfig)
          ? (candidate.recordConfig as Record<string, unknown>)
          : undefined,
    },
  }
}

/**
 * Materialises a published platform forms master into a tenant-owned operational
 * form and its initial immutable version. The whole adoption, lineage binding,
 * property applicability, and audit trail share one database transaction.
 */
export async function adoptPublishedPlatformFormTemplate(
  ctx: RequestContext,
  input: { masterVersionId: string; configurationKey: string; propertyIds?: readonly string[] },
) {
  assertCan(ctx, 'admin.settings.manage')
  const configurationKey = requiredText(input.configurationKey, 'Configuration key', 97)
  if (!templateKeyPattern.test(configurationKey)) {
    throw new Error('Configuration key must be a stable lowercase key.')
  }
  const propertyIds = [...new Set(input.propertyIds ?? [])]
  for (const propertyId of propertyIds) assertCanAccessProperty(ctx, propertyId)

  const source = await ctx.db(async (tx) => {
    const [row] = await tx
      .select({ master: configurationMasters, version: configurationMasterVersions })
      .from(configurationMasterVersions)
      .innerJoin(
        configurationMasters,
        eq(configurationMasters.id, configurationMasterVersions.masterId),
      )
      .where(
        and(
          eq(configurationMasterVersions.id, input.masterVersionId),
          eq(configurationMasterVersions.state, 'published'),
          eq(configurationMasters.state, 'published'),
          eq(configurationMasters.domainType, 'form_template'),
        ),
      )
      .limit(1)
    if (!row) throw new Error('Published platform form template version not found.')
    return row
  })
  const payload = parsePlatformFormTemplatePayload(source.version.payload)
  if (payload.formTemplate.moduleKey) {
    await assertTenantModuleEntitled(ctx, payload.formTemplate.moduleKey)
  }

  return ctx.db(async (tx) => {
    const [existing] = await tx
      .select({ id: tenantConfigurations.id })
      .from(tenantConfigurations)
      .where(
        and(
          eq(tenantConfigurations.tenantId, ctx.tenantId),
          eq(tenantConfigurations.sourceMasterVersionId, source.version.id),
        ),
      )
      .limit(1)
    if (existing) throw new Error('This platform configuration version has already been adopted.')

    const [configuration] = await tx
      .insert(tenantConfigurations)
      .values({
        tenantId: ctx.tenantId,
        domainType: source.master.domainType,
        key: configurationKey,
        name: payload.formTemplate.name,
        sourceMasterId: source.master.id,
        sourceMasterVersionId: source.version.id,
        createdByUserId: ctx.userId,
        state: 'published',
      })
      .returning()
    if (!configuration) throw new Error('Configuration adoption failed.')

    const [configurationVersion] = await tx
      .insert(tenantConfigurationVersions)
      .values({
        tenantId: ctx.tenantId,
        configurationId: configuration.id,
        version: 1,
        payload: structuredClone(source.version.payload),
        sourceMasterVersionId: source.version.id,
        state: 'published',
        publishedAt: new Date(),
        publishedByUserId: ctx.userId,
        createdByUserId: ctx.userId,
      })
      .returning()
    if (!configurationVersion) throw new Error('Configuration version creation failed.')

    const [template] = await tx
      .insert(formTemplates)
      .values({
        tenantId: ctx.tenantId,
        key: payload.formTemplate.key,
        name: payload.formTemplate.name,
        category: payload.formTemplate.category ?? null,
        description: payload.formTemplate.description ?? null,
        kind: payload.formTemplate.kind ?? 'form',
        iconKey: payload.formTemplate.iconKey ?? null,
        allowedRoles: payload.formTemplate.allowedRoles ?? null,
        moduleBinding: payload.formTemplate.moduleBinding ?? null,
        emailOnSubmit: payload.formTemplate.emailOnSubmit,
        surfaceAsTool: payload.formTemplate.surfaceAsTool,
        recordConfig: payload.formTemplate.recordConfig ?? null,
        status: 'published',
        createdBy: ctx.userId,
      })
      .returning()
    if (!template) throw new Error('Tenant form template materialisation failed.')

    const [templateVersion] = await tx
      .insert(formTemplateVersions)
      .values({
        tenantId: ctx.tenantId,
        templateId: template.id,
        version: 1,
        schema: payload.formTemplate.schema,
        changelog: `Adopted from platform master version ${source.version.version}`,
        publishedAt: new Date(),
        publishedBy: ctx.userId,
      })
      .returning()
    if (!templateVersion) throw new Error('Initial tenant form template version failed.')

    await tx.insert(tenantConfigurationFormTemplates).values({
      tenantId: ctx.tenantId,
      configurationId: configuration.id,
      formTemplateId: template.id,
    })
    if (propertyIds.length) {
      await tx.insert(tenantConfigurationPropertyApplicability).values(
        propertyIds.map((propertyId) => ({
          tenantId: ctx.tenantId,
          configurationId: configuration.id,
          propertyId,
          createdByUserId: ctx.userId,
        })),
      )
    }
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant_configuration',
      entityId: configuration.id,
      action: 'create',
      summary: `Materialised platform form template ${source.master.key}`,
      after: {
        masterId: source.master.id,
        masterVersionId: source.version.id,
        configurationVersionId: configurationVersion.id,
        formTemplateId: template.id,
        formTemplateVersionId: templateVersion.id,
        propertyIds,
      },
    })
    return { configuration, configurationVersion, template, templateVersion }
  })
}
