'use server'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { recordAuditInTransaction } from '@/lib/audit'
import {
  storeTenantBrandAsset,
  deleteTenantBrandAsset,
  TenantBrandAssetValidationError,
} from '@/lib/tenant-brand-assets'
import { normalizeThemeColor } from '@/lib/theme-governance'
import type { TenantBrandingFormState } from '@/lib/tenant-branding-form-state'

export async function saveCurrentTenantBranding(
  _previous: TenantBrandingFormState,
  formData: FormData,
): Promise<TenantBrandingFormState> {
  // Derive tenant exclusively from authenticated context, never the form.
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const submittedTenant = formData.get('tenantId')
  if (submittedTenant !== null && submittedTenant !== ctx.tenantId)
    return { status: 'error', outcome: 'invalid_tenant' }
  const rawColour = String(formData.get('primaryColor') ?? '').trim()
  const primaryColor = normalizeThemeColor(rawColour)
  if (rawColour && !primaryColor) return { status: 'error', outcome: 'invalid_hex' }
  const uploaded: string[] = []
  let committed = false
  try {
    const upload = async (name: 'logo' | 'letterhead') => {
      const file = formData.get(name)
      if (!(file instanceof File) || !file.size) return undefined
      if (file.size > (name === 'logo' ? 2 : 5) * 1024 * 1024)
        throw new TenantBrandAssetValidationError('Asset too large')
      const key = await storeTenantBrandAsset({
        tenantId: ctx.tenantId,
        kind: name,
        contentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })
      uploaded.push(key)
      return key
    }
    const logo = formData.get('resetLogo') === '1' ? undefined : await upload('logo')
    const letterhead =
      formData.get('resetLetterhead') === '1' ? undefined : await upload('letterhead')
    const result = await withSuperAdmin(db, async (tx) => {
      const [tenant] = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1)
        .for('update')
      if (!tenant) throw new Error('Tenant unavailable')
      const branding = {
        ...tenant.branding,
        primaryColor,
        logoUrl: formData.get('resetLogo') === '1' ? undefined : (logo ?? tenant.branding.logoUrl),
        pdfLetterhead:
          formData.get('resetLetterhead') === '1'
            ? undefined
            : (letterhead ?? tenant.branding.pdfLetterhead),
      }
      await tx
        .update(tenants)
        .set({ branding, updatedAt: new Date() })
        .where(eq(tenants.id, ctx.tenantId))
      await recordAuditInTransaction(tx, ctx, {
        entityType: 'tenant',
        entityId: ctx.tenantId,
        action: 'update',
        summary: 'Tenant branding updated',
        before: tenant.branding,
        after: branding,
      })
      return { before: tenant.branding, after: branding }
    })
    committed = true
    // Cleanup is best-effort after the audited update has committed.
    for (const key of [
      result.before.logoUrl !== result.after.logoUrl ? result.before.logoUrl : undefined,
      result.before.pdfLetterhead !== result.after.pdfLetterhead
        ? result.before.pdfLetterhead
        : undefined,
    ]) {
      if (key) await deleteTenantBrandAsset(ctx.tenantId, key).catch(() => undefined)
    }
    revalidatePath('/', 'layout')
    return { status: 'success', outcome: 'saved' }
  } catch (error) {
    if (!committed)
      await Promise.all(
        uploaded.map((key) => deleteTenantBrandAsset(ctx.tenantId, key).catch(() => undefined)),
      )
    return {
      status: 'error',
      outcome: error instanceof TenantBrandAssetValidationError ? 'invalid_asset' : 'save_failed',
    }
  }
}
