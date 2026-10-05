import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { PlatformTenantTabs } from '@/components/platform-tenant-tabs'
export default async function TenantAdministrationLayout({
  params,
  children,
}: {
  params: Promise<{ tenantId: string }>
  children: React.ReactNode
}) {
  await requirePlatformOperator()
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
  )
  if (!tenant) notFound()
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlatformTenantTabs tenantId={tenantId} tenantName={tenant.name} />
      {children}
    </div>
  )
}
