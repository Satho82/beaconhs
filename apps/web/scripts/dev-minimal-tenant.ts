import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { and, count, eq, sql } from 'drizzle-orm'
import { createClient, extractRows, provisionTenantBaseline, type Database } from '@beaconhs/db'
import {
  auditLog,
  BUILTIN_ROLES,
  hospitalityProperties,
  platformAuditLog,
  roleAssignments,
  roles,
  tenantModuleEntitlements,
  tenants,
  tenantUsers,
  users,
} from '@beaconhs/db/schema'
import { assertCan, makeTenantContext, resolveMembershipAccess } from '@beaconhs/tenant'
import { MODULE_CATALOGUE } from '../src/lib/module-entitlements/catalogue'
import { createProperty } from '../src/lib/hospitality/properties'
import { upsertRoleAssignments } from '../src/lib/role-assignment-upsert'
import { requireFirstIdentityTarget } from './dev-first-identity'

const slug = 'uvanoo-development-hotel-group'
const marker = 'uvanoo-minimal-development-v1'

export function assertOwnedDevelopmentTenant(tenant: {
  slug: string
  name: string
  status: string
  settings: Record<string, unknown>
}) {
  if (
    tenant.slug !== slug ||
    tenant.name !== 'Uvanoo Development Hotel Group' ||
    tenant.status !== 'active' ||
    tenant.settings.devBootstrap !== marker
  )
    throw new Error('Existing tenant is not the owned active minimal DEV fixture')
}

export async function provisionMinimalDevTenant(
  env: Readonly<Record<string, string | undefined>>,
  evidence: Parameters<typeof requireFirstIdentityTarget>[1],
) {
  requireFirstIdentityTarget(env, evidence)
  if (env.UVANOO_DEV_BOOTSTRAP_CONFIRM !== 'CREATE_MINIMAL_DEV_TENANT')
    throw new Error('Explicit minimal DEV tenant confirmation required')
  const maintenance = createClient({ url: env.SUPERADMIN_DATABASE_URL, max: 1 })
  const app = createClient({ url: env.DATABASE_URL, max: 1 })
  try {
    const fixture = await maintenance.db.transaction(async (transaction) => {
      const tx = transaction as unknown as Database
      const [target] = extractRows(
        await tx.execute(sql`SELECT current_database() AS database,
        current_user AS role, host(inet_server_addr()) AS address`),
      )
      if (
        !target ||
        target.database !== 'beaconhs' ||
        target.role !== 'beaconhs_super' ||
        target.address !== evidence.address
      )
        throw new Error('Connected server does not match DEV Docker target')
      await tx.execute(sql`SELECT pg_advisory_xact_lock(14002003)`)
      const identities = await tx.select().from(users)
      const identity = identities[0]
      if (
        identities.length !== 1 ||
        !identity ||
        identity.email !== 'dev.admin@uvanoo.invalid' ||
        identity.isSuperAdmin ||
        identity.disabledAt
      )
        throw new Error('Expected only the unprivileged canonical first DEV identity')
      const provenance = await tx
        .select()
        .from(platformAuditLog)
        .where(
          and(
            eq(platformAuditLog.entityType, 'development_first_identity'),
            eq(platformAuditLog.entityId, identity.id),
            eq(platformAuditLog.action, 'create'),
          ),
        )
      if (provenance.length !== 1)
        throw new Error('First-identity provenance is missing or ambiguous')
      const existingTenants = await tx.select().from(tenants)
      if (existingTenants.length > 1) throw new Error('Refusing a non-minimal DEV database')
      let tenant = existingTenants[0]
      if (tenant) assertOwnedDevelopmentTenant(tenant)
      if (!tenant) {
        const [created] = await tx
          .insert(tenants)
          .values({
            slug,
            name: 'Uvanoo Development Hotel Group',
            status: 'active',
            region: 'eu-west-2',
            defaultLanguage: 'en',
            enabledLanguages: ['en'],
            hierarchy: { customer: true, project: false, site: true, area: false },
            settings: { devBootstrap: marker },
          })
          .returning()
        if (!created) throw new Error('DEV tenant creation failed')
        tenant = created
        const baseline = await provisionTenantBaseline(tx, {
          tenantId: tenant.id,
          moduleKeys: MODULE_CATALOGUE.map((module) => module.key),
          changedByUserId: identity.id,
        })
        await tx.insert(auditLog).values({
          tenantId: tenant.id,
          actorUserId: identity.id,
          entityType: 'tenant',
          entityId: tenant.id,
          action: 'create',
          summary: 'Created authorized minimal development tenant',
          after: { baseline, enabledModules: ['hospitality.properties'] },
          metadata: { via: 'guarded-dev-cli' },
        })
        await tx
          .update(tenantModuleEntitlements)
          .set({ state: 'enabled', changedByUserId: identity.id })
          .where(
            and(
              eq(tenantModuleEntitlements.tenantId, tenant.id),
              eq(tenantModuleEntitlements.moduleKey, 'hospitality.properties'),
            ),
          )
      }
      const memberships = await tx
        .select()
        .from(tenantUsers)
        .where(eq(tenantUsers.userId, identity.id))
      let membership = memberships[0]
      if (
        memberships.length > 1 ||
        (membership && (membership.tenantId !== tenant.id || membership.status !== 'active'))
      )
        throw new Error('Existing DEV membership is not canonical')
      if (!membership) {
        const [created] = await tx
          .insert(tenantUsers)
          .values({
            tenantId: tenant.id,
            userId: identity.id,
            displayName: identity.name,
            status: 'active',
            joinedAt: new Date(),
          })
          .returning()
        if (!created) throw new Error('DEV membership creation failed')
        membership = created
        await tx.insert(auditLog).values({
          tenantId: tenant.id,
          actorUserId: identity.id,
          entityType: 'tenant_user',
          entityId: membership.id,
          action: 'create',
          summary: 'Established first DEV administrator membership',
          metadata: { via: 'guarded-dev-cli' },
        })
      }
      const [role] = await tx
        .select()
        .from(roles)
        .where(and(eq(roles.tenantId, tenant.id), eq(roles.key, 'tenant_admin')))
      if (
        !role ||
        JSON.stringify(role.permissions) !== JSON.stringify(BUILTIN_ROLES.tenant_admin?.permissions)
      )
        throw new Error('Canonical tenant-admin role missing or modified')
      const assignments = await tx
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.tenantUserId, membership.id))
      if (
        assignments.length > 1 ||
        assignments.some(
          (assignment) =>
            assignment.tenantId !== tenant.id ||
            assignment.roleId !== role.id ||
            assignment.scope.type !== 'tenant',
        )
      )
        throw new Error('Refusing to overwrite unrelated role assignments')
      // Explicit, guarded maintenance authority, not a fabricated login/session.
      // Normal browser requests resolve the persisted membership and remain subject to RLS.
      const changed = await upsertRoleAssignments({ isSuperAdmin: true }, tx, [
        {
          tenantId: tenant.id,
          tenantUserId: membership.id,
          roleId: role.id,
          scope: { type: 'tenant' },
        },
      ])
      if (changed.length)
        await tx.insert(auditLog).values({
          tenantId: tenant.id,
          actorUserId: identity.id,
          entityType: 'tenant_user',
          entityId: membership.id,
          action: 'update',
          summary: 'Assigned canonical DEV tenant administrator role',
          after: { roleId: role.id, scope: 'tenant' },
          metadata: { via: 'guarded-dev-cli' },
        })
      return { tenant, membership, identity }
    })
    const base = makeTenantContext(app.db, {
      userId: fixture.identity.id,
      tenantId: fixture.tenant.id,
      isSuperAdmin: false,
      timezone: 'Europe/London',
      locale: 'en',
      defaultLocale: 'en',
      enabledLocales: ['en'],
      localeOverride: null,
      membership: { id: fixture.membership.id, displayName: fixture.identity.name },
      personId: null,
      permissions: new Set(),
      scopes: [],
    })
    const access = await base.db((tx) => resolveMembershipAccess(tx, fixture.membership.id))
    const ctx = makeTenantContext(app.db, { ...base, ...access })
    assertCan(ctx, 'admin.settings.manage')
    const properties = await ctx.db((tx) =>
      tx
        .select()
        .from(hospitalityProperties)
        .where(eq(hospitalityProperties.tenantId, ctx.tenantId)),
    )
    let property = properties[0]
    if (
      properties.length > 1 ||
      (property &&
        (property.name !== 'Uvanoo Development Hotel' ||
          property.code !== 'UVANOO-DEV' ||
          property.deletedAt))
    )
      throw new Error('Refusing to overwrite unrelated DEV property data')
    if (!property)
      property = await createProperty(ctx, {
        name: 'Uvanoo Development Hotel',
        code: 'UVANOO-DEV',
        timezone: 'Europe/London',
      })
    const [membershipCount] = await ctx.db((tx) =>
      tx.select({ total: count() }).from(tenantUsers).where(eq(tenantUsers.tenantId, ctx.tenantId)),
    )
    return {
      tenantId: ctx.tenantId,
      propertyId: property.id,
      membershipCount: membershipCount?.total,
      permission: 'admin.settings.manage',
    }
  } finally {
    await Promise.all([maintenance.sql.end(), app.sql.end()])
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = JSON.parse(readFileSync('/run/uvanoo-dev-target.json', 'utf8'))
    console.log(await provisionMinimalDevTenant(process.env, evidence))
  } catch {
    console.error('Minimal DEV tenant bootstrap refused or failed; no credentials logged')
    process.exitCode = 1
  }
}
