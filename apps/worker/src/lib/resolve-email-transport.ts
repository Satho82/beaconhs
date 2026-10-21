// Resolve the effective email transport for a send, applying the platform →
// tenant policy. The decision logic itself is the pure
// `resolveEffectiveTransport` in @beaconhs/emails; this module only fetches the
// two stored configs (platform singleton + the tenant's settings.email) from the
// database. The platform policy is read for every job so the global kill switch
// takes effect immediately.

import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { platformSettings, PLATFORM_SETTINGS_ID, tenants } from '@beaconhs/db/schema'
import {
  resolveEffectiveTransport,
  type EffectiveEmail,
  type EmailTransport,
  type PlatformEmailConfig,
  type RawEmailConfig,
} from '@beaconhs/emails'

type PlatformEmailAndBrand = {
  email: PlatformEmailConfig | null
  productName: string | null
}

const DEFAULT_PLATFORM_NAME = 'BeaconHS'

function platformProductName(branding: unknown): string | null {
  if (!branding || typeof branding !== 'object') return null
  const productName = (branding as Record<string, unknown>).productName
  if (typeof productName !== 'string') return null
  const normalized = productName
    .replace(/[\r\n<>\"]/g, '')
    .trim()
    .slice(0, 128)
  return normalized || null
}

function withPlatformSenderName(
  delivery: EffectiveEmail,
  productName: string | null,
): EffectiveEmail {
  if (delivery.kind !== 'transport') return delivery
  const from = delivery.transport.from.trim()
  const match = /<([^<>]+)>$/.exec(from)
  const address = (match?.[1] ?? from).trim()
  if (!address || /[\r\n<>]/.test(address)) return delivery
  const name = productName ?? DEFAULT_PLATFORM_NAME
  return {
    ...delivery,
    transport: { ...delivery.transport, from: `${name} <${address}>` },
  }
}

async function readPlatformEmail(): Promise<PlatformEmailAndBrand | null> {
  return withSuperAdmin(db, async (tx) => {
    const [row] = await tx
      .select({ email: platformSettings.email, branding: platformSettings.branding })
      .from(platformSettings)
      .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
      .limit(1)
    if (!row) return null
    const raw = row.email
    return {
      email: raw && typeof raw === 'object' ? (raw as PlatformEmailConfig) : null,
      productName: platformProductName(row.branding),
    }
  })
}

async function readTenantEmail(tenantId: string): Promise<RawEmailConfig | null> {
  return withSuperAdmin(db, async (tx) => {
    const [row] = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    const raw = (row?.settings as Record<string, unknown> | undefined)?.email
    return raw && typeof raw === 'object' ? (raw as RawEmailConfig) : null
  })
}

/** Decide how (and whether) to send an email for a given tenant (null = platform send). */
export async function resolveEmailDelivery(tenantId: string | null): Promise<EffectiveEmail> {
  const platform = await readPlatformEmail()
  const tenant = tenantId ? await readTenantEmail(tenantId) : null
  const delivery = resolveEffectiveTransport(platform?.email ?? null, tenant, {
    tenantScoped: Boolean(tenantId),
  })
  return withPlatformSenderName(delivery, platform?.productName ?? null)
}

/** Production sends must resolve through the database-managed provider system. */
export function requireEmailTransport(delivery: EffectiveEmail): EmailTransport {
  if (delivery.kind === 'transport') return delivery.transport
  if (delivery.kind === 'suppressed') {
    throw new Error('Email delivery is disabled by the platform administrator.')
  }
  throw new Error(
    'Email delivery is not configured: configure an enabled platform or tenant provider.',
  )
}
