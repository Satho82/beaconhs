import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { platformSettings, PLATFORM_SETTINGS_ID } from '@beaconhs/db/schema'

export type AuthEmailCopy = {
  magicLinkSubject?: string
  magicLinkBody?: string
  magicLinkCta?: string
  inviteSubject?: string
  inviteBody?: string
  inviteCta?: string
  passwordResetSubject?: string
  passwordResetBody?: string
  passwordResetCta?: string
}

export type PlatformEmailBranding = {
  senderName?: string
  footer?: string
  supportEmail?: string
  authEmail?: AuthEmailCopy
}

/** Product identity shared by public pages and platform-authentication emails. */
export type PlatformBranding = {
  productName?: string
  logoUrl?: string
  primaryColor?: string
  email?: PlatformEmailBranding
}

const authCopyKeys = [
  'magicLinkSubject',
  'magicLinkBody',
  'magicLinkCta',
  'inviteSubject',
  'inviteBody',
  'inviteCta',
  'passwordResetSubject',
  'passwordResetBody',
  'passwordResetCta',
] as const

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Reads only the supported keys from the JSON column. This deliberately makes
 * a malformed or future value harmless to public pages and email delivery.
 */
export function normalizePlatformBranding(value: unknown): PlatformBranding {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const rawEmail = raw.email && typeof raw.email === 'object' ? (raw.email as Record<string, unknown>) : {}
  const rawCopy =
    rawEmail.authEmail && typeof rawEmail.authEmail === 'object'
      ? (rawEmail.authEmail as Record<string, unknown>)
      : {}
  const authEmail = Object.fromEntries(
    authCopyKeys.flatMap((key) => {
      const copy = optionalString(rawCopy[key])
      return copy ? [[key, copy]] : []
    }),
  ) as AuthEmailCopy
  const email: PlatformEmailBranding = {
    senderName: optionalString(rawEmail.senderName),
    footer: optionalString(rawEmail.footer),
    supportEmail: optionalString(rawEmail.supportEmail),
    ...(Object.keys(authEmail).length ? { authEmail } : {}),
  }

  return {
    productName: optionalString(raw.productName),
    logoUrl: optionalString(raw.logoUrl),
    primaryColor: optionalString(raw.primaryColor),
    ...(Object.values(email).some(Boolean) ? { email } : {}),
  }
}

export async function getPlatformBranding(): Promise<PlatformBranding> {
  return withSuperAdmin(db, async (tx) => {
    const [row] = await tx
      .select({ branding: platformSettings.branding })
      .from(platformSettings)
      .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
      .limit(1)

    return normalizePlatformBranding(row?.branding)
  })
}

export async function savePlatformBranding(branding: PlatformBranding): Promise<void> {
  const next = normalizePlatformBranding(branding)
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
