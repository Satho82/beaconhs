'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, eq, isNotNull, notInArray } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenantUsers, tenants } from '@beaconhs/db/schema'
import { LOCALE_OPTIONS, normalizeLocalePolicy } from '@beaconhs/i18n'
import { can, resolveRegulatoryTerminology } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { recordAuditInTransaction } from '@/lib/audit'
import { parseTenantOperationalDefaults } from '@/lib/tenant-operational-defaults'
import { normalizeThemeColor } from '@/lib/theme-governance'

async function requireSettingsAdmin() {
  const ctx = await requireRequestContext()
  if (!can(ctx, 'admin.settings.manage')) redirect('/admin')
  return ctx
}

export async function saveSettings(formData: FormData) {
  const ctx = await requireSettingsAdmin()
  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  const defaultLanguage = String(formData.get('defaultLanguage') ?? 'en')
  const operationalDefaults = parseTenantOperationalDefaults({
    locale: formData.get('operationalLocale'),
    timezone: formData.get('operationalTimezone'),
    dateFormat: formData.get('dateFormat'),
    numberFormat: formData.get('numberFormat'),
    currencyCode: formData.get('defaultCurrencyCode'),
  })
  const enabledLanguages = LOCALE_OPTIONS.map((l) => l.value).filter(
    (l) => formData.get(`lang_${l}`) === 'on',
  )
  const languagePolicy = normalizeLocalePolicy({
    defaultLocale: defaultLanguage,
    enabledLocales: enabledLanguages,
  })
  const hierarchy = {
    customer: formData.get('lvl_customer') === 'on',
    project: formData.get('lvl_project') === 'on',
    site: formData.get('lvl_site') === 'on',
    area: formData.get('lvl_area') === 'on',
  }
  const requestedPrimaryColor = String(formData.get('primaryColor') ?? '').trim()
  if (requestedPrimaryColor && !normalizeThemeColor(requestedPrimaryColor))
    throw new Error('Primary colour must be a six-digit HEX value.')
  const branding = {
    logoUrl: String(formData.get('logoUrl') ?? '').trim() || undefined,
    primaryColor: normalizeThemeColor(requestedPrimaryColor),
    pdfLetterhead: String(formData.get('pdfLetterhead') ?? '').trim() || undefined,
  }
  const regulatoryTerminology = resolveRegulatoryTerminology({
    regulatoryTerminology: {
      authorityName: formData.get('authorityName'),
      authorityAbbreviation: formData.get('authorityAbbreviation'),
      legislationName: formData.get('legislationName'),
      legislationAbbreviation: formData.get('legislationAbbreviation'),
      otherApplicableLegislation: formData.get('otherApplicableLegislation'),
    },
  })
  await withSuperAdmin(db, async (tx) => {
    const [before] = await tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1)
    const tenantName = name || (before?.name ?? 'Tenant')
    const tenantSlug = slug || (before?.slug ?? 'tenant')
    await tx
      .update(tenants)
      .set({
        name: tenantName,
        slug: tenantSlug,
        defaultLanguage: languagePolicy.defaultLocale,
        enabledLanguages: languagePolicy.enabledLocales,
        operationalLocale: operationalDefaults.locale,
        operationalTimezone: operationalDefaults.timezone,
        dateFormat: operationalDefaults.dateFormat,
        numberFormat: operationalDefaults.numberFormat,
        defaultCurrencyCode: operationalDefaults.currencyCode,
        hierarchy,
        branding,
        settings: { ...(before?.settings ?? {}), regulatoryTerminology },
      })
      .where(eq(tenants.id, ctx.tenantId))
    const clearedOverrides = await tx
      .update(tenantUsers)
      .set({ localeOverride: null, updatedAt: new Date() })
      .where(
        and(
          eq(tenantUsers.tenantId, ctx.tenantId),
          isNotNull(tenantUsers.localeOverride),
          notInArray(tenantUsers.localeOverride, languagePolicy.enabledLocales),
        ),
      )
      .returning({ id: tenantUsers.id })

    await recordAuditInTransaction(tx, ctx, {
      entityType: 'tenant',
      entityId: ctx.tenantId,
      action: 'update',
      summary: 'Tenant settings updated',
      before: before
        ? {
            name: before.name,
            slug: before.slug,
            defaultLanguage: before.defaultLanguage,
            enabledLanguages: before.enabledLanguages,
            operationalLocale: before.operationalLocale,
            operationalTimezone: before.operationalTimezone,
            dateFormat: before.dateFormat,
            numberFormat: before.numberFormat,
            defaultCurrencyCode: before.defaultCurrencyCode,
            hierarchy: before.hierarchy,
            branding: before.branding,
            regulatoryTerminology: resolveRegulatoryTerminology(before.settings),
          }
        : null,
      after: {
        name: tenantName,
        slug: tenantSlug,
        defaultLanguage: languagePolicy.defaultLocale,
        enabledLanguages: languagePolicy.enabledLocales,
        ...operationalDefaults,
        hierarchy,
        branding,
        regulatoryTerminology,
      },
      metadata: { clearedLocaleOverrides: clearedOverrides.length },
    })
  })

  revalidatePath('/', 'layout')
}
