import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { platformSettings, PLATFORM_SETTINGS_ID } from '@beaconhs/db/schema'

export type PlatformBranding = {
  productName?: string
  logoUrl?: string
  primaryColor?: string
}

function normalizeBranding(value: unknown): PlatformBranding {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>

  return {
    productName: typeof raw.productName === 'string' ? raw.productName : undefined,
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : undefined,
    primaryColor: typeof raw.primaryColor === 'string' ? raw.primaryColor : undefined,
  }
}

export async function getPlatformBranding(): Promise<PlatformBranding> {
  return withSuperAdmin(db, async (tx) => {
    const [row] = await tx
      .select({ branding: platformSettings.branding })
      .from(platformSettings)
      .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
      .limit(1)

    return normalizeBranding(row?.branding)
  })
}

export async function savePlatformBranding(branding: PlatformBranding): Promise<void> {
  const next: PlatformBranding = {
    productName: branding.productName?.trim() || undefined,
    logoUrl: branding.logoUrl?.trim() || undefined,
    primaryColor: branding.primaryColor?.trim() || undefined,
  }

  await withSuperAdmin(db, async (tx) => {
    await tx
      .insert(platformSettings)
      .values({ id: PLATFORM_SETTINGS_ID, branding: next })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { branding: next },
      })
  })
}
