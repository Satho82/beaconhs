import { and, eq } from 'drizzle-orm'
import {
  configurationMasterVersions,
  configurationMasters,
  formTemplates,
  tenantConfigurationFormTemplates,
  tenantConfigurationPropertyApplicability,
  tenantConfigurations,
  tenantConfigurationVersions,
} from '@beaconhs/db/schema'
import { assertCan, type RequestContext } from '@beaconhs/tenant'
import { recordAuditInTransaction } from './audit'
import { assertCanAccessProperty } from './hospitality/property-access'

function key(value: string, field: string) {
  const result = value.trim()
  if (!/^[a-z][a-z0-9._-]{1,96}$/.test(result))
    throw new Error(`${field} must be a stable lowercase key.`)
  return result
}

/**
 * Creates a tenant-owned draft from a published platform version. The payload
 * is copied by value; subsequent tenant edits cannot mutate the master.
 */
export async function adoptPublishedConfiguration(
  ctx: RequestContext,
  input: { masterVersionId: string; key: string; name: string },
) {
  assertCan(ctx, 'admin.settings.manage')
  const configurationKey = key(input.key, 'Configuration key')
  const name = input.name.trim()
  if (!name || name.length > 160) throw new Error('Configuration name is required.')

  return ctx.db(async (tx) => {
    const [source] = await tx
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
        ),
      )
      .limit(1)
    if (!source) throw new Error('Published platform configuration version not found.')

    const [configuration] = await tx
      .insert(tenantConfigurations)
      .values({
        tenantId: ctx.tenantId,
        domainType: source.master.domainType,
        key: configurationKey,
        name,
        sourceMasterId: source.master.id,
        sourceMasterVersionId: source.version.id,
        createdByUserId: ctx.userId,
      })
      .returning()
    if (!configuration) throw new Error('Configuration adoption failed.')
    const [version] = await tx
      .insert(tenantConfigurationVersions)
      .values({
        tenantId: ctx.tenantId,
        configurationId: configuration.id,
        version: 1,
        payload: structuredClone(source.version.payload),
        sourceMasterVersionId: source.version.id,
        createdByUserId: ctx.userId,
      })
      .returning()
    if (!version) throw new Error('Configuration version creation failed.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant_configuration',
      entityId: configuration.id,
      action: 'create',
      summary: `Adopted platform configuration ${source.master.key}`,
      after: {
        masterId: source.master.id,
        masterVersionId: source.version.id,
        configurationVersionId: version.id,
      },
    })
    return { configuration, version }
  })
}

/** Property rows mean selected applicability; no rows means tenant-wide applicability. */
export async function setConfigurationPropertyApplicability(
  ctx: RequestContext,
  configurationId: string,
  propertyIds: readonly string[],
) {
  assertCan(ctx, 'admin.settings.manage')
  const ids = [...new Set(propertyIds)]
  for (const propertyId of ids) assertCanAccessProperty(ctx, propertyId)
  return ctx.db(async (tx) => {
    const [configuration] = await tx
      .select({ id: tenantConfigurations.id })
      .from(tenantConfigurations)
      .where(
        and(
          eq(tenantConfigurations.tenantId, ctx.tenantId),
          eq(tenantConfigurations.id, configurationId),
        ),
      )
      .limit(1)
    if (!configuration) throw new Error('Tenant configuration not found.')
    await tx
      .delete(tenantConfigurationPropertyApplicability)
      .where(
        and(
          eq(tenantConfigurationPropertyApplicability.tenantId, ctx.tenantId),
          eq(tenantConfigurationPropertyApplicability.configurationId, configuration.id),
        ),
      )
    if (ids.length) {
      await tx.insert(tenantConfigurationPropertyApplicability).values(
        ids.map((propertyId) => ({
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
      action: 'update',
      summary: 'Updated configuration property applicability',
      metadata: { propertyIds: ids, tenantWide: ids.length === 0 },
    })
  })
}

/** Forms-first integration only binds an existing tenant template; no form row is copied or changed. */
export async function bindConfigurationToFormTemplate(
  ctx: RequestContext,
  configurationId: string,
  formTemplateId: string,
) {
  assertCan(ctx, 'admin.settings.manage')
  return ctx.db(async (tx) => {
    const [row] = await tx
      .select({ configurationId: tenantConfigurations.id, formTemplateId: formTemplates.id })
      .from(tenantConfigurations)
      .innerJoin(
        formTemplates,
        and(
          eq(formTemplates.tenantId, tenantConfigurations.tenantId),
          eq(formTemplates.id, formTemplateId),
        ),
      )
      .where(
        and(
          eq(tenantConfigurations.tenantId, ctx.tenantId),
          eq(tenantConfigurations.id, configurationId),
        ),
      )
      .limit(1)
    if (!row) throw new Error('Configuration and form template must belong to this tenant.')
    await tx
      .insert(tenantConfigurationFormTemplates)
      .values({
        tenantId: ctx.tenantId,
        configurationId: row.configurationId,
        formTemplateId: row.formTemplateId,
      })
      .onConflictDoUpdate({
        target: [
          tenantConfigurationFormTemplates.tenantId,
          tenantConfigurationFormTemplates.configurationId,
        ],
        set: { formTemplateId: row.formTemplateId, updatedAt: new Date() },
      })
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant_configuration',
      entityId: row.configurationId,
      action: 'update',
      summary: 'Bound configuration to an existing form template',
      metadata: { formTemplateId: row.formTemplateId },
    })
  })
}
