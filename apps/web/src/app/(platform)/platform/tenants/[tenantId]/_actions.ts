'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { and, eq, isNull } from 'drizzle-orm'
import { translateSystemCopy } from '@beaconhs/i18n/messages'
import { db, provisionTenantBaseline, withSuperAdmin } from '@beaconhs/db'
import { auditLog, hospitalityProperties, tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { setActiveTenant } from '@/lib/actions'
import { recordPlatformAudit } from '@/lib/platform-audit'
import { isUuid } from '@/lib/list-params'
import { MODULE_CATALOGUE } from '@/lib/module-entitlements/catalogue'

const lifecycleStates = new Set(['active', 'suspended', 'archived'])

/** Platform-only tenant lifecycle mutation. Tenant rows are retained permanently. */
export async function changeTenantLifecycle(formData: FormData): Promise<void> {
  const locale = await getLocale()
  const operator = await requirePlatformOperator()
  const tenantId = String(formData.get('tenantId') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!isUuid(tenantId) || !lifecycleStates.has(status))
    throw new Error('Invalid tenant lifecycle request.')

  const [changed] = await withSuperAdmin(db, async (tx) =>
    tx
      .update(tenants)
      .set({
        status: status as 'active' | 'suspended' | 'archived',
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning({
        id: tenants.id,
        name: tenants.name,
        status: tenants.status,
      }),
  )
  if (!changed) throw new Error('Tenant not found.')

  await recordPlatformAudit(operator, {
    entityType: 'tenant',
    entityId: changed.id,
    action: `lifecycle.${status}`,
    summary: translateSystemCopy(locale, '{value0} tenant {value1}', {
      value0:
        status === 'active'
          ? translateSystemCopy(locale, 'Activated or restored')
          : status === 'suspended'
            ? translateSystemCopy(locale, 'Suspended')
            : translateSystemCopy(locale, 'Archived'),
      value1: changed.name,
    }),
    after: { status: changed.status },
  })
  revalidatePath('/platform/tenants')
  revalidatePath(`/platform/tenants/${tenantId}`)
}

/** Sensitive tenant defaults are edited at platform scope and always audited. */
export async function saveTenantPlatformSettings(formData: FormData): Promise<void> {
  const locale = await getLocale()
  const operator = await requirePlatformOperator()
  const tenantId = String(formData.get('tenantId') ?? '')
  const region = String(formData.get('region') ?? '').trim()
  const defaultLanguage = String(formData.get('defaultLanguage') ?? '').trim()
  if (!isUuid(tenantId) || !region || !['en', 'fr', 'es'].includes(defaultLanguage))
    throw new Error('Invalid tenant settings request.')
  const [changed] = await withSuperAdmin(db, async (tx) =>
    tx
      .update(tenants)
      .set({ region, defaultLanguage, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning({
        id: tenants.id,
        name: tenants.name,
        region: tenants.region,
        defaultLanguage: tenants.defaultLanguage,
      }),
  )
  if (!changed) throw new Error('Tenant not found.')
  await recordPlatformAudit(operator, {
    entityType: 'tenant',
    entityId: changed.id,
    action: 'settings.update',
    summary: translateSystemCopy(locale, 'Updated platform settings for {value0}', {
      value0: changed.name,
    }),
    after: { region: changed.region, defaultLanguage: changed.defaultLanguage },
  })
  revalidatePath(`/platform/tenants/${tenantId}`)
  revalidatePath(`/platform/tenants/${tenantId}/settings`)
}

/** Platform-only property lifecycle. Properties are never hard-deleted. */
export async function saveTenantProperty(formData: FormData): Promise<void> {
  const operator = await requirePlatformOperator()
  const tenantId = String(formData.get('tenantId') ?? '')
  const propertyId = String(formData.get('propertyId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()
  const timezone = String(formData.get('timezone') ?? '').trim()
  if (!isUuid(tenantId) || !name || !code || !timezone) throw new Error('Invalid property request.')
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone })
  } catch {
    throw new Error('Choose a valid property time zone.')
  }
  const result = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) throw new Error('Tenant not found.')
    if (!propertyId) {
      const [created] = await tx
        .insert(hospitalityProperties)
        .values({ tenantId, name, code, timezone })
        .returning()
      if (!created) throw new Error('Could not create property.')
      return { property: created, action: 'property.create' as const, tenant }
    }
    if (!isUuid(propertyId)) throw new Error('Invalid property request.')
    const [updated] = await tx
      .update(hospitalityProperties)
      .set({ name, code, timezone, updatedAt: new Date() })
      .where(
        and(
          eq(hospitalityProperties.id, propertyId),
          eq(hospitalityProperties.tenantId, tenantId),
          isNull(hospitalityProperties.deletedAt),
        ),
      )
      .returning()
    if (!updated) throw new Error('Active property not found in this tenant.')
    return { property: updated, action: 'property.update' as const, tenant }
  })
  await recordPlatformAudit(operator, {
    entityType: 'property',
    entityId: result.property.id,
    action: result.action,
    summary: `${result.action === 'property.create' ? 'Created' : 'Updated'} ${result.property.name} in ${result.tenant.name}`,
    after: { tenantId, name, code, timezone },
  })
  revalidatePath(`/platform/tenants/${tenantId}/properties`)
  revalidatePath(`/platform/tenants/${tenantId}`)
}

export async function setTenantPropertyArchived(formData: FormData): Promise<void> {
  const operator = await requirePlatformOperator()
  const tenantId = String(formData.get('tenantId') ?? '')
  const propertyId = String(formData.get('propertyId') ?? '')
  const archived = String(formData.get('archived') ?? '') === 'on'
  if (!isUuid(tenantId) || !isUuid(propertyId))
    throw new Error('Invalid property lifecycle request.')
  const [property] = await withSuperAdmin(db, async (tx) =>
    tx
      .update(hospitalityProperties)
      .set({ deletedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(
        and(eq(hospitalityProperties.id, propertyId), eq(hospitalityProperties.tenantId, tenantId)),
      )
      .returning(),
  )
  if (!property) throw new Error('Property not found in this tenant.')
  await recordPlatformAudit(operator, {
    entityType: 'property',
    entityId: property.id,
    action: archived ? 'property.archive' : 'property.restore',
    summary: `${archived ? 'Archived' : 'Restored'} ${property.name}`,
    after: { tenantId, archived },
  })
  revalidatePath(`/platform/tenants/${tenantId}/properties`)
  revalidatePath(`/platform/tenants/${tenantId}`)
}

/** Opens the canonical tenant invite workflow with a server-authorized tenant context. */
export async function openTenantUserInvite(formData: FormData): Promise<never> {
  await requirePlatformOperator()
  const tenantId = String(formData.get('tenantId') ?? '')
  if (!isUuid(tenantId)) throw new Error('Invalid tenant request.')
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  )
  if (!tenant || tenant.status !== 'active')
    throw new Error('Restore this tenant before adding users.')
  const switched = await setActiveTenant(tenantId)
  if (!switched.ok) throw new Error('Could not select this tenant.')
  redirect('/admin/users/invite')
}

/** Adds only missing standard configuration; it never re-seeds tenant operations. */
export async function repairTenantBaseline(formData: FormData): Promise<void> {
  const locale = await getLocale()
  const operator = await requirePlatformOperator()
  const tenantId = String(formData.get('tenantId') ?? '')
  if (!isUuid(tenantId)) throw new Error('Invalid tenant request.')

  const result = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) throw new Error('Tenant not found.')
    const baseline = await provisionTenantBaseline(tx, {
      tenantId,
      moduleKeys: MODULE_CATALOGUE.map((module) => module.key),
      changedByUserId: operator.userId,
    })
    if (baseline.changed) {
      await tx.insert(auditLog).values({
        tenantId,
        actorUserId: operator.userId,
        entityType: 'tenant',
        entityId: tenantId,
        action: 'baseline.repair',
        summary: `Repaired standard baseline for ${tenant.name}`,
        after: baseline,
      })
    }
    return { tenant, baseline }
  })

  if (result.baseline.changed) {
    await recordPlatformAudit(operator, {
      entityType: 'tenant',
      entityId: tenantId,
      action: 'baseline.repair',
      summary: translateSystemCopy(locale, 'Repaired standard baseline for {value0}', {
        value0: result.tenant.name,
      }),
      after: result.baseline,
    })
  }
  revalidatePath(`/platform/tenants/${tenantId}`)
  revalidatePath(`/platform/tenants/${tenantId}/entitlements`)
}
