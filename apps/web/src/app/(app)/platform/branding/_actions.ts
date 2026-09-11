'use server'

import { revalidatePath } from 'next/cache'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import type { RequestContext } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { savePlatformBranding } from '@/lib/platform-branding-config'

function gatePlatform(ctx: RequestContext) {
  if (!ctx.isSuperAdmin) {
    throw new Error('Only platform super-admins can change platform branding.')
  }
}

export async function savePlatformBrandingAction(formData: FormData) {
  const ctx = await requireRequestContext()
  gatePlatform(ctx)
  const tGenerated = await getGeneratedTranslations()

  const productName = String(formData.get('productName') ?? '').trim()
  const logoUrl = String(formData.get('logoUrl') ?? '').trim()
  const primaryColor = String(formData.get('primaryColor') ?? '').trim()

  if (productName.length > 100) {
    throw new Error('Product name must be 100 characters or fewer.')
  }

  if (logoUrl.length > 2_000) {
    throw new Error('Logo URL must be 2,000 characters or fewer.')
  }

  if (logoUrl) {
    let parsedLogoUrl: URL
    try {
      parsedLogoUrl = new URL(logoUrl)
    } catch {
      throw new Error('Logo URL must be a valid URL.')
    }

    if (!['http:', 'https:'].includes(parsedLogoUrl.protocol)) {
      throw new Error('Logo URL must use http or https.')
    }
  }

  if (primaryColor.length > 50) {
    throw new Error('Primary colour must be 50 characters or fewer.')
  }

  await savePlatformBranding({
    productName,
    logoUrl,
    primaryColor,
  })

  await recordAudit(ctx, {
    entityType: 'platform',
    action: 'update',
    summary: tGenerated('m_15176e3aae0a5c'),
    metadata: {
      productName: productName || null,
      logoConfigured: Boolean(logoUrl),
      primaryColor: primaryColor || null,
    },
  })

  revalidatePath('/platform/branding')
  revalidatePath('/', 'layout')
}
