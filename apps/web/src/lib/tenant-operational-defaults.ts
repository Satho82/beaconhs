import 'server-only'

import { eq } from 'drizzle-orm'
import { tenants } from '@beaconhs/db/schema'
import type { Database } from '@beaconhs/db'
import type { RequestContext } from '@beaconhs/tenant'

/** Values written by the current settings UI. */
export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD MMM YYYY',
  'D MMM YYYY',
  'DD MMMM YYYY',
  'MMMM D, YYYY',
] as const
export const DATE_FORMAT_OPTIONS = [
  ['DD/MM/YYYY', 'dateFormat_dayMonthYear'],
  ['MM/DD/YYYY', 'dateFormat_monthDayYear'],
  ['YYYY-MM-DD', 'dateFormat_yearMonthDay'],
  ['DD MMM YYYY', 'dateFormat_dayShortMonthYear'],
  ['D MMM YYYY', 'dateFormat_unpaddedDayShortMonthYear'],
  ['DD MMMM YYYY', 'dateFormat_dayLongMonthYear'],
  ['MMMM D, YYYY', 'dateFormat_longMonthDayYear'],
] as const satisfies ReadonlyArray<readonly [DateFormat, string]>
/** Historic values remain valid so existing tenant records can be read safely. */
export const LEGACY_DATE_FORMATS = ['short', 'medium', 'long'] as const
export const NUMBER_FORMATS = ['standard', 'compact'] as const
type DateFormat = (typeof DATE_FORMATS)[number]
type LegacyDateFormat = (typeof LEGACY_DATE_FORMATS)[number]
type StoredDateFormat = DateFormat | LegacyDateFormat
type NumberFormat = (typeof NUMBER_FORMATS)[number]

type TenantOperationalDefaults = {
  locale: string
  timezone: string
  dateFormat: StoredDateFormat
  numberFormat: NumberFormat
  currencyCode: string
}

export const DEFAULT_TENANT_OPERATIONAL_DEFAULTS: TenantOperationalDefaults = {
  locale: 'en',
  timezone: 'UTC',
  dateFormat: 'DD/MM/YYYY',
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
  const dateFormat = String(input.dateFormat ?? '') as StoredDateFormat
  const numberFormat = String(input.numberFormat ?? '') as NumberFormat
  if (!validLocale(locale)) throw new Error('Locale must be a valid BCP 47 locale.')
  if (!validTimezone(timezone)) throw new Error('Timezone must be a valid IANA timezone.')
  if (!validCurrency(currencyCode)) throw new Error('Currency must be a valid ISO 4217 code.')
  if (
    !(DATE_FORMATS as readonly string[]).includes(dateFormat) &&
    !(LEGACY_DATE_FORMATS as readonly string[]).includes(dateFormat)
  ) {
    throw new Error('Choose a valid date format.')
  }
  if (!NUMBER_FORMATS.includes(numberFormat)) throw new Error('Choose a valid number format.')
  return { locale, timezone, dateFormat, numberFormat, currencyCode }
}

/**
 * Canonical server-side tenant operational defaults resolver. Callers must
 * pass their current tenant transaction/context; this function never selects
 * an arbitrary tenant from client input.
 */
async function resolveTenantOperationalDefaults(
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
