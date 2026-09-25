import { redirect } from 'next/navigation'
import { assertCan } from '@beaconhs/tenant'
import { requireRequestContext } from '@/lib/auth'
import { assertTenantModuleEntitled } from '@/lib/module-entitlements/server'
/** Hospitality is additive to the existing app shell and dashboard. */
export default async function HospitalityPage() {
  const ctx = await requireRequestContext()
  await assertTenantModuleEntitled(ctx, 'hospitality.properties')
  assertCan(ctx, 'hospitality.read')
  redirect('/hospitality/properties')
}
