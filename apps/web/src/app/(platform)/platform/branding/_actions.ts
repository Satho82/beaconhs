'use server'

import { revalidatePath } from 'next/cache'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import type { GeneratedMessageKey } from '@/i18n/generated'
import { requirePlatformOperator } from '@/lib/auth'
import { recordPlatformAudit } from '@/lib/platform-audit'
import { deletePlatformBrandAsset, storePlatformBrandAsset } from '@/lib/platform-brand-assets'
import { getPlatformBranding, savePlatformBranding } from '@/lib/platform-branding-config'

const GOOGLE_MEASUREMENT_ID = /^G-[A-Z0-9]{6,}$/

function uploadedFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null
}

async function storeAsset(kind: 'logo' | 'favicon', file: File): Promise<string> {
  return storePlatformBrandAsset({
    kind,
    contentType: file.type.toLowerCase(),
    bytes: new Uint8Array(await file.arrayBuffer()),
  })
}

export async function savePlatformBrandingAction(formData: FormData) {
  const operator = await requirePlatformOperator()
  const tGenerated = await getGeneratedTranslations()
  const previous = await getPlatformBranding()
  const productName = String(formData.get('productName') ?? '').trim()
  const primaryColor = String(formData.get('primaryColor') ?? '').trim()
  const analyticsEnabled = formData.get('analyticsEnabled') === 'on'
  const googleTagId = String(formData.get('googleTagId') ?? '')
    .trim()
    .toUpperCase()
  const logo = uploadedFile(formData.get('logo'))
  const favicon = uploadedFile(formData.get('favicon'))
  const resetLogo = formData.get('resetLogo') === '1'
  const resetFavicon = formData.get('resetFavicon') === '1'

  if (productName.length > 100) throw new Error('Product name must be 100 characters or fewer.')
  if (primaryColor.length > 50) throw new Error('Primary colour must be 50 characters or fewer.')
  if (analyticsEnabled && !GOOGLE_MEASUREMENT_ID.test(googleTagId)) {
    throw new Error('Google Measurement ID must use the G-XXXXXXXXXX format.')
  }

  const logoKey = resetLogo ? undefined : logo ? await storeAsset('logo', logo) : previous.logoKey
  const faviconKey = resetFavicon
    ? undefined
    : favicon
      ? await storeAsset('favicon', favicon)
      : previous.faviconKey
  const faviconContentType = favicon ? favicon.type.toLowerCase() : previous.faviconContentType
  await savePlatformBranding({
    ...previous,
    productName,
    primaryColor,
    logoUrl: logoKey || resetLogo ? undefined : previous.logoUrl,
    logoKey,
    faviconKey,
    faviconContentType: faviconKey ? faviconContentType : undefined,
    analytics: { enabled: analyticsEnabled, ...(analyticsEnabled ? { googleTagId } : {}) },
  })

  await Promise.all([
    logo && previous.logoKey ? deletePlatformBrandAsset(previous.logoKey) : undefined,
    favicon && previous.faviconKey ? deletePlatformBrandAsset(previous.faviconKey) : undefined,
    resetLogo ? deletePlatformBrandAsset(previous.logoKey) : undefined,
    resetFavicon ? deletePlatformBrandAsset(previous.faviconKey) : undefined,
  ])
  const auditSummaries: GeneratedMessageKey[] = []
  if (logo) auditSummaries.push('m_e2f5a8c3d6b470')
  if (resetLogo) auditSummaries.push('m_f3a6b9d4e7c581')
  if (favicon) auditSummaries.push('m_a4b7c1e5f8d692')
  if (resetFavicon) auditSummaries.push('m_b5c8d2f6a9e703')
  if (analyticsEnabled && !previous.analytics?.enabled) auditSummaries.push('m_c6d9e3a7b1f814')
  if (!analyticsEnabled && previous.analytics?.enabled) auditSummaries.push('m_d7e1f4b8c2a925')
  if (googleTagId && googleTagId !== previous.analytics?.googleTagId) {
    auditSummaries.push('m_e8f2a5c9d3b036')
  }
  await Promise.all(
    (auditSummaries.length ? auditSummaries : (['m_15176e3aae0a5c'] as GeneratedMessageKey[])).map(
      (summary) =>
        recordPlatformAudit(operator, {
          entityType: 'platform-branding',
          action: 'update',
          summary: tGenerated(summary),
        }),
    ),
  )
  revalidatePath('/platform/branding')
  revalidatePath('/', 'layout')
}
