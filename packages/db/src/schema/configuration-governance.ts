import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, softDelete, timestamps } from './_helpers'
import { tenants, users } from './core'
import { hospitalityProperties } from './hospitality'
import { formTemplates } from './forms'

export const configurationLifecycleState = pgEnum('configuration_lifecycle_state', [
  'draft',
  'published',
  'archived',
])

/** Platform-owned identity. Its versions, rather than tenant customizations, are authoritative. */
export const configurationMasters = pgTable(
  'configuration_masters',
  {
    id: id(),
    domainType: text('domain_type').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    state: configurationLifecycleState('state').default('draft').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    domainKeyUx: uniqueIndex('configuration_masters_domain_key_ux').on(t.domainType, t.key),
    stateIdx: index('configuration_masters_domain_state_idx').on(t.domainType, t.state),
  }),
)

/** A master version is immutable after publication; payload semantics stay domain-specific. */
export const configurationMasterVersions = pgTable(
  'configuration_master_versions',
  {
    id: id(),
    masterId: uuid('master_id')
      .notNull()
      .references(() => configurationMasters.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    changelog: text('changelog'),
    state: configurationLifecycleState('state').default('draft').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: text('published_by_user_id').references(() => users.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    masterVersionUx: uniqueIndex('configuration_master_versions_master_version_ux').on(
      t.masterId,
      t.version,
    ),
    masterIdIdUx: uniqueIndex('configuration_master_versions_master_id_id_ux').on(t.masterId, t.id),
    masterStateIdx: index('configuration_master_versions_master_state_idx').on(t.masterId, t.state),
  }),
)

/** Tenant-owned configuration identity, optionally adopted from a platform master. */
export const tenantConfigurations = pgTable(
  'tenant_configurations',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    domainType: text('domain_type').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    sourceMasterId: uuid('source_master_id').references(() => configurationMasters.id),
    sourceMasterVersionId: uuid('source_master_version_id').references(
      () => configurationMasterVersions.id,
    ),
    state: configurationLifecycleState('state').default('draft').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    tenantDomainKeyUx: uniqueIndex('tenant_configurations_domain_key_ux').on(
      t.tenantId,
      t.domainType,
      t.key,
    ),
    tenantIdIdUx: uniqueIndex('tenant_configurations_tenant_id_id_ux').on(t.tenantId, t.id),
    tenantStateIdx: index('tenant_configurations_tenant_state_idx').on(t.tenantId, t.state),
    sourceLineageCheck: check(
      'tenant_configurations_source_lineage_check',
      sql`(${t.sourceMasterId} IS NULL AND ${t.sourceMasterVersionId} IS NULL) OR (${t.sourceMasterId} IS NOT NULL AND ${t.sourceMasterVersionId} IS NOT NULL)`,
    ),
    sourceMasterVersionFk: foreignKey({
      name: 'tenant_configurations_source_master_version_fk',
      columns: [t.sourceMasterId, t.sourceMasterVersionId],
      foreignColumns: [configurationMasterVersions.masterId, configurationMasterVersions.id],
    }),
  }),
)

export const tenantConfigurationVersions = pgTable(
  'tenant_configuration_versions',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    configurationId: uuid('configuration_id').notNull(),
    version: integer('version').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    changelog: text('changelog'),
    state: configurationLifecycleState('state').default('draft').notNull(),
    sourceMasterVersionId: uuid('source_master_version_id').references(
      () => configurationMasterVersions.id,
    ),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedByUserId: text('published_by_user_id').references(() => users.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    configurationVersionUx: uniqueIndex(
      'tenant_configuration_versions_configuration_version_ux',
    ).on(t.configurationId, t.version),
    tenantConfigurationIdUx: uniqueIndex(
      'tenant_configuration_versions_tenant_configuration_id_ux',
    ).on(t.tenantId, t.configurationId, t.id),
    configurationFk: foreignKey({
      name: 'tenant_configuration_versions_tenant_configuration_fk',
      columns: [t.tenantId, t.configurationId],
      foreignColumns: [tenantConfigurations.tenantId, tenantConfigurations.id],
    }).onDelete('cascade'),
    sourceMasterVersionFk: foreignKey({
      name: 'tenant_configuration_versions_source_master_version_fk',
      columns: [t.sourceMasterVersionId],
      foreignColumns: [configurationMasterVersions.id],
    }),
  }),
)

/** Published tenant configuration applies to all properties when no rows exist, or selected rows. */
export const tenantConfigurationPropertyApplicability = pgTable(
  'tenant_configuration_property_applicability',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    configurationId: uuid('configuration_id').notNull(),
    propertyId: uuid('property_id').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    ...timestamps,
  },
  (t) => ({
    tenantConfigurationPropertyUx: uniqueIndex('tenant_configuration_property_applicability_ux').on(
      t.tenantId,
      t.configurationId,
      t.propertyId,
    ),
    configurationFk: foreignKey({
      name: 'tenant_configuration_applicability_configuration_fk',
      columns: [t.tenantId, t.configurationId],
      foreignColumns: [tenantConfigurations.tenantId, tenantConfigurations.id],
    }).onDelete('cascade'),
    propertyFk: foreignKey({
      name: 'tenant_configuration_applicability_property_fk',
      columns: [t.tenantId, t.propertyId],
      foreignColumns: [hospitalityProperties.tenantId, hospitalityProperties.id],
    }),
  }),
)

/** The forms-first boundary: this governance configuration may point at one tenant-owned form identity. */
export const tenantConfigurationFormTemplates = pgTable(
  'tenant_configuration_form_templates',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    configurationId: uuid('configuration_id').notNull(),
    formTemplateId: uuid('form_template_id').notNull(),
    ...timestamps,
  },
  (t) => ({
    configurationUx: uniqueIndex('tenant_configuration_form_templates_configuration_ux').on(
      t.tenantId,
      t.configurationId,
    ),
    formTemplateUx: uniqueIndex('tenant_configuration_form_templates_template_ux').on(
      t.tenantId,
      t.formTemplateId,
    ),
    configurationFk: foreignKey({
      name: 'tenant_configuration_form_templates_configuration_fk',
      columns: [t.tenantId, t.configurationId],
      foreignColumns: [tenantConfigurations.tenantId, tenantConfigurations.id],
    }).onDelete('cascade'),
    formTemplateFk: foreignKey({
      name: 'tenant_configuration_form_templates_template_fk',
      columns: [t.tenantId, t.formTemplateId],
      foreignColumns: [formTemplates.tenantId, formTemplates.id],
    }),
  }),
)

export const configurationMastersRelations = relations(configurationMasters, ({ many }) => ({
  versions: many(configurationMasterVersions),
}))

export const tenantConfigurationsRelations = relations(tenantConfigurations, ({ many }) => ({
  versions: many(tenantConfigurationVersions),
  propertyApplicability: many(tenantConfigurationPropertyApplicability),
  formBindings: many(tenantConfigurationFormTemplates),
}))
