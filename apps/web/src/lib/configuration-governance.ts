import { and, desc, eq } from 'drizzle-orm'
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

/** Creates a new tenant-owned draft. Published versions remain immutable history. */
export async function createTenantConfigurationDraft(
  ctx: RequestContext,
  input: { configurationId: string; payload: Record<string, unknown>; changelog?: string },
) {
  assertCan(ctx, 'admin.settings.manage')
  return ctx.db(async (tx) => {
    const [configuration] = await tx
      .select()
      .from(tenantConfigurations)
      .where(
        and(
          eq(tenantConfigurations.tenantId, ctx.tenantId),
          eq(tenantConfigurations.id, input.configurationId),
        ),
      )
      .limit(1)
    if (!configuration || configuration.state === 'archived')
      throw new Error('Tenant configuration is not available for editing.')
    const [latest] = await tx
      .select({ version: tenantConfigurationVersions.version })
      .from(tenantConfigurationVersions)
      .where(
        and(
          eq(tenantConfigurationVersions.tenantId, ctx.tenantId),
          eq(tenantConfigurationVersions.configurationId, configuration.id),
        ),
      )
      .orderBy(desc(tenantConfigurationVersions.version))
      .limit(1)
    const [draft] = await tx
      .insert(tenantConfigurationVersions)
      .values({
        tenantId: ctx.tenantId,
        configurationId: configuration.id,
        version: (latest?.version ?? 0) + 1,
        payload: structuredClone(input.payload),
        changelog: input.changelog?.trim() || null,
        state: 'draft',
        sourceMasterVersionId: configuration.sourceMasterVersionId,
        createdByUserId: ctx.userId,
      })
      .returning()
    if (!draft) throw new Error('Configuration draft creation failed.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant_configuration',
      entityId: configuration.id,
      action: 'update',
      summary: 'Created tenant configuration draft version',
      after: { configurationVersionId: draft.id, version: draft.version },
    })
    return draft
  })
}

export async function publishTenantConfigurationVersion(
  ctx: RequestContext,
  input: { configurationId: string; versionId: string },
) {
  assertCan(ctx, 'admin.settings.manage')
  return ctx.db(async (tx) => {
    const [draft] = await tx
      .select({ configuration: tenantConfigurations, version: tenantConfigurationVersions })
      .from(tenantConfigurationVersions)
      .innerJoin(
        tenantConfigurations,
        and(
          eq(tenantConfigurations.tenantId, tenantConfigurationVersions.tenantId),
          eq(tenantConfigurations.id, tenantConfigurationVersions.configurationId),
        ),
      )
      .where(
        and(
          eq(tenantConfigurationVersions.tenantId, ctx.tenantId),
          eq(tenantConfigurationVersions.id, input.versionId),
          eq(tenantConfigurationVersions.configurationId, input.configurationId),
          eq(tenantConfigurationVersions.state, 'draft'),
        ),
      )
      .limit(1)
    if (!draft || draft.configuration.state === 'archived')
      throw new Error('Draft configuration version is not available for publishing.')
    const now = new Date()
    await tx
      .update(tenantConfigurationVersions)
      .set({ state: 'published', publishedAt: now, publishedByUserId: ctx.userId, updatedAt: now })
      .where(eq(tenantConfigurationVersions.id, draft.version.id))
    await tx
      .update(tenantConfigurations)
      .set({ state: 'published', updatedAt: now })
      .where(eq(tenantConfigurations.id, draft.configuration.id))
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant_configuration',
      entityId: draft.configuration.id,
      action: 'update',
      summary: 'Published tenant configuration version',
      after: { configurationVersionId: draft.version.id, version: draft.version.version },
    })
  })
}

export async function archiveTenantConfiguration(ctx: RequestContext, configurationId: string) {
  assertCan(ctx, 'admin.settings.manage')
  return ctx.db(async (tx) => {
    const now = new Date()
    const [configuration] = await tx
      .update(tenantConfigurations)
      .set({ state: 'archived', archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(tenantConfigurations.tenantId, ctx.tenantId),
          eq(tenantConfigurations.id, configurationId),
        ),
      )
      .returning({ id: tenantConfigurations.id })
    if (!configuration) throw new Error('Tenant configuration not found.')
    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant_configuration',
      entityId: configuration.id,
      action: 'update',
      summary: 'Archived tenant configuration',
    })
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
