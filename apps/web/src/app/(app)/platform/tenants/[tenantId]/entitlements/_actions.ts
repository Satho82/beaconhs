'use server'

import { revalidatePath } from 'next/cache'
import { requireRequestContext } from '@/lib/auth'
import { setTenantModuleEntitlement } from '@/lib/module-entitlements/platform'

function optionalDate(value: FormDataEntryValue | null): Date | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const date = new Date(`${text}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid entitlement date.')
  return date
}

export async function saveTenantModuleEntitlementAction(formData: FormData) {
  const ctx = await requireRequestContext()
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  if (!tenantId) throw new Error('Tenant is required.')
  await setTenantModuleEntitlement(ctx, tenantId, {
    moduleKey: String(formData.get('moduleKey') ?? ''),
    state: String(formData.get('state') ?? ''),
    effectiveFrom: optionalDate(formData.get('effectiveFrom')),
    effectiveUntil: optionalDate(formData.get('effectiveUntil')),
  })
  revalidatePath(`/platform/tenants/${tenantId}/entitlements`)
  revalidatePath('/', 'layout')
}
