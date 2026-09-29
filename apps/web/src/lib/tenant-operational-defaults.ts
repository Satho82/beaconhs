import 'server-only'

import { eq } from 'drizzle-orm'
import { tenants } from '@beaconhs/db/schema'
import type { Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'

export const DATE_FORMATS = ['short', 'medium', 'long'] as const
export const NUMBER_FORMATS = ['standard', 'compact'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]
export type NumberFormat = (typeof NUMBER_FORMATS)[number]

export type TenantOperationalDefaults = {
  locale: string
  timezone: string
  dateFormat: DateFormat
  numberFormat: NumberFormat
  currencyCode: string
}

export const DEFAULT_TENANT_OPERATIONAL_DEFAULTS: TenantOperationalDefaults = {
  locale: 'en',
  timezone: 'UTC',
  dateFormat: 'medium',
  numberFormat: 'standard',
  currencyCode: 'USD',
}

function validLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function validCurrency(value: string): boolean {
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: value })
    return /^[A-Z]{3}$/.test(value)
  } catch {
    return false
  }
}

export function parseTenantOperationalDefaults(
  input: Record<string, unknown>,
): TenantOperationalDefaults {
  const locale = String(input.locale ?? '').trim()
  const timezone = String(input.timezone ?? '').trim()
  const currencyCode = String(input.currencyCode ?? '')
    .trim()
    .toUpperCase()
  const dateFormat = String(input.dateFormat ?? '') as DateFormat
  const numberFormat = String(input.numberFormat ?? '') as NumberFormat
  if (!validLocale(locale)) throw new Error('Locale must be a valid BCP 47 locale.')
  if (!validTimezone(timezone)) throw new Error('Timezone must be a valid IANA timezone.')
  if (!validCurrency(currencyCode)) throw new Error('Currency must be a valid ISO 4217 code.')
  if (!DATE_FORMATS.includes(dateFormat)) throw new Error('Choose a valid date format.')
  if (!NUMBER_FORMATS.includes(numberFormat)) throw new Error('Choose a valid number format.')
  return { locale, timezone, dateFormat, numberFormat, currencyCode }
}

/**
 * Canonical server-side tenant operational defaults resolver. Callers must
 * pass their current tenant transaction/context; this function never selects
 * an arbitrary tenant from client input.
 */
export async function resolveTenantOperationalDefaults(
  tx: Database,
  tenantId: string,
): Promise<TenantOperationalDefaults> {
  const [tenant] = await tx
    .select({
      locale: tenants.operationalLocale,
      timezone: tenants.operationalTimezone,
      dateFormat: tenants.dateFormat,
      numberFormat: tenants.numberFormat,
      currencyCode: tenants.defaultCurrencyCode,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  if (!tenant) throw new Error('Tenant operational defaults are not available.')
  return parseTenantOperationalDefaults(tenant)
}

export async function resolveTenantOperationalDefaultsForContext(
  ctx: RequestContext,
): Promise<TenantOperationalDefaults> {
  return ctx.db((tx) => resolveTenantOperationalDefaults(tx, ctx.tenantId))
}
