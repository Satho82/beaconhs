'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { recordPlatformAudit } from '@/lib/platform-audit'
import {
  deleteTenantBrandAsset,
  storeTenantBrandAsset,
  TenantBrandAssetValidationError,
} from '@/lib/tenant-brand-assets'
import { isUuid } from '@/lib/list-params'
import { getGeneratedTranslations } from '@/i18n/generated.server'

const HEX = /^#[0-9A-F]{6}$/i

export type TenantBrandingOutcome =
  'saved' | 'invalid_tenant' | 'invalid_hex' | 'invalid_asset' | 'save_failed'
export type TenantBrandingFormState = {
  status: 'idle' | 'success' | 'error'
  outcome?: TenantBrandingOutcome
}

export async function saveTenantBranding(
  _previous: TenantBrandingFormState,
  formData: FormData,
): Promise<TenantBrandingFormState> {
  try {
    const operator = await requirePlatformOperator()
    const tenantId = String(formData.get('tenantId') ?? '')
    if (!isUuid(tenantId)) return { status: 'error', outcome: 'invalid_tenant' }
    const colour = String(formData.get('primaryColor') ?? '').trim()
    if (colour && !HEX.test(colour)) return { status: 'error', outcome: 'invalid_hex' }
    const logo = formData.get('logo')
    const letterhead = formData.get('letterhead')
    const resetLogo = formData.get('resetLogo') === '1'
    const resetLetterhead = formData.get('resetLetterhead') === '1'
    const result = await withSuperAdmin(db, async (tx) => {
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
      if (!tenant) return null
      const old = tenant.branding
      const logoKey =
        logo instanceof File && logo.size
          ? await storeTenantBrandAsset({
              tenantId,
              kind: 'logo',
              contentType: logo.type,
              bytes: new Uint8Array(await logo.arrayBuffer()),
            })
          : undefined
      const letterheadKey =
        letterhead instanceof File && letterhead.size
          ? await storeTenantBrandAsset({
              tenantId,
              kind: 'letterhead',
              contentType: letterhead.type,
              bytes: new Uint8Array(await letterhead.arrayBuffer()),
            })
          : undefined
      const branding = {
        ...old,
        primaryColor: colour || undefined,
        logoUrl: resetLogo ? undefined : (logoKey ?? old.logoUrl),
        pdfLetterhead: resetLetterhead ? undefined : (letterheadKey ?? old.pdfLetterhead),
      }
      await tx
        .update(tenants)
        .set({ branding, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId))
      return { tenant, old, branding, logoKey, letterheadKey }
    })
    if (!result) return { status: 'error', outcome: 'invalid_tenant' }
    if (resetLogo || result.logoKey) await deleteTenantBrandAsset(tenantId, result.old.logoUrl)
    if (resetLetterhead || result.letterheadKey)
      await deleteTenantBrandAsset(tenantId, result.old.pdfLetterhead)
    await recordPlatformAudit(operator, {
      entityType: 'tenant-branding',
      entityId: tenantId,
      action: 'update',
      summary: (await getGeneratedTranslations())('m_11c9b9a39f9753', {
        value0: result.tenant.name,
      }),
      after: result.branding,
    })
    revalidatePath(`/platform/tenants/${tenantId}/branding`)
    revalidatePath('/', 'layout')
    return { status: 'success', outcome: 'saved' }
  } catch (error) {
    // A typed validation error is safe to collapse; provider details never cross
    // the server-action boundary.
    if (error instanceof TenantBrandAssetValidationError) {
      return { status: 'error', outcome: 'invalid_asset' }
    }
    return { status: 'error', outcome: 'save_failed' }
  }
}
