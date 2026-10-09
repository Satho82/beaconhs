'use server'
import { revalidatePath } from 'next/cache'
import { requirePlatformOperator } from '@/lib/auth'
import { getPlatformBranding, savePlatformBranding } from '@/lib/platform-branding-config'
import { recordPlatformAudit } from '@/lib/platform-audit'
import { db, withSuperAdmin } from '@beaconhs/db'
import { platformSettings, platformAuditLog, PLATFORM_SETTINGS_ID } from '@beaconhs/db/schema'
import { parseTenantOperationalDefaults } from '@/lib/tenant-operational-defaults'

export async function savePlatformRegionalDefaults(data: FormData) {
  const operator = await requirePlatformOperator()
  const defaults = parseTenantOperationalDefaults({
    locale: data.get('locale'),
    timezone: data.get('timezone'),
    dateFormat: data.get('dateFormat'),
    numberFormat: data.get('numberFormat'),
    currencyCode: data.get('currencyCode'),
  })
  await withSuperAdmin(db, async (tx) => {
    await tx
      .insert(platformSettings)
      .values({ id: PLATFORM_SETTINGS_ID, regionalDefaults: defaults })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { regionalDefaults: defaults, updatedAt: new Date() },
      })
    await tx.insert(platformAuditLog).values({
      actorUserId: operator.userId,
      entityType: 'platform-regional-defaults',
      action: 'update',
      summary: 'Updated regional defaults for newly created tenants',
      after: defaults,
    })
  })
  revalidatePath('/platform/settings')
}

export async function savePlatformIdentity(data: FormData) {
  const operator = await requirePlatformOperator()
  const productName = String(data.get('productName') ?? '').trim()
  const primaryColor = String(data.get('primaryColor') ?? '').trim()
  if (!productName || productName.length > 100)
    throw new Error('Enter a platform name of 1–100 characters.')
  if (primaryColor && !/^#[0-9a-f]{6}$/i.test(primaryColor))
    throw new Error('Enter a six-digit HEX colour.')
  const previous = await getPlatformBranding()
  await savePlatformBranding({ ...previous, productName, primaryColor })
  await recordPlatformAudit(operator, {
    entityType: 'platform-branding',
    action: 'update',
    summary: 'Platform identity and default primary colour updated',
  })
  revalidatePath('/', 'layout')
}
