import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { assertCan, can } from '@beaconhs/tenant'
import { PageHeader } from '@beaconhs/ui'
import { requireRequestContext } from '@/lib/auth'
import { PageContainer } from '@/components/page-layout'
import { TenantBrandingForm } from '@/components/tenant-branding-form'
import { isTenantBrandAssetKey } from '@/lib/tenant-brand-asset-url'
import { SettingsNavigation } from '../settings-form'
import { saveCurrentTenantBranding } from './_actions'
import { getPlatformBranding } from '@/lib/platform-branding-config'
import { resolveTenantPrimaryAction } from '@/lib/theme-governance'
export const dynamic = 'force-dynamic'
export default async function BrandingSettingsPage() {
  const tBoard = await getGeneratedValueTranslations()
  const tBoardMessage = await getGeneratedTranslations()

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
  const platformBranding = await getPlatformBranding()
  return (
    <PageContainer>
      <div className="space-y-5">
        <PageHeader
          title={tBoard('Tenant Settings')}
          description={tBoardMessage('m_0a19f0c1debc78', { value0: tenant.name })}
        />
        <SettingsNavigation
          canManageIntegrations={can(ctx, 'admin.integrations.manage')}
          navigationLabel="Tenant Settings"
          activeSection="branding"
        />
        <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
          <h2 className="mb-5 text-lg font-semibold">{tBoard('Tenant Branding')}</h2>
          <TenantBrandingForm
            key={JSON.stringify(tenant.branding)}
            tenantId={ctx.tenantId}
            tenantName={tenant.name}
            saveAction={saveCurrentTenantBranding}
            primaryColor={tenant.branding.primaryColor}
            platformPrimaryColor={resolveTenantPrimaryAction(
              platformBranding.primaryColor,
              undefined,
            )}
            platformLogoUrl={platformBranding.logoUrl}
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
