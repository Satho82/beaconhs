import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { assertCan } from '@beaconhs/tenant'
import { PageHeader } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { PageContainer } from '@/components/page-layout'
import { TenantBrandingForm } from '@/components/tenant-branding-form'
import { isTenantBrandAssetKey } from '@/lib/tenant-brand-asset-url'
import { SettingsNavigation } from '../settings-form'
import { saveCurrentTenantBranding } from './_actions'
export const dynamic = 'force-dynamic'
export default async function BrandingSettingsPage() {
  const ctx = await requireRequestContext()
  assertCan(ctx, 'admin.settings.manage')
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ name: tenants.name, branding: tenants.branding })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1),
  )
  if (!tenant) notFound()
  return (
    <PageContainer>
      <div className="space-y-5">
        <PageHeader
          title="Tenant Settings"
          description={`${tenant.name} · Changes apply to this tenant.`}
        />
        <SettingsNavigation navigationLabel="Tenant Settings" activeSection="branding" />
        <section className="max-w-3xl rounded-xl border bg-white p-5 dark:bg-slate-900">
          <h2 className="mb-5 text-lg font-semibold">Tenant Branding</h2>
          <TenantBrandingForm
            key={JSON.stringify(tenant.branding)}
            tenantId={ctx.tenantId}
            tenantName={tenant.name}
            saveAction={saveCurrentTenantBranding}
            primaryColor={tenant.branding.primaryColor}
            hasLogo={!!tenant.branding.logoUrl}
            hasLetterhead={!!tenant.branding.pdfLetterhead}
            logoUrl={
              isTenantBrandAssetKey(ctx.tenantId, tenant.branding.logoUrl, 'logo')
                ? '/admin/settings/branding/assets/logo'
                : undefined
            }
            letterheadUrl={
              isTenantBrandAssetKey(ctx.tenantId, tenant.branding.pdfLetterhead, 'letterhead')
                ? '/admin/settings/branding/assets/letterhead'
                : undefined
            }
          />
        </section>
      </div>
    </PageContainer>
  )
}
