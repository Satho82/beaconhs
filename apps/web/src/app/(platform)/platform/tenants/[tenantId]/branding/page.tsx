import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, DetailHeader } from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { tenantBrandAssetUrl } from '@/lib/tenant-brand-asset-url'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { TenantBrandingForm } from '@/components/tenant-branding-form'
import { saveTenantBranding } from './_actions'

export const dynamic = 'force-dynamic'

export default async function PlatformTenantBrandingPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const t = await getGeneratedTranslations()
  await requirePlatformOperator()
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ name: tenants.name, branding: tenants.branding })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  )
  if (!tenant) notFound()
  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl space-y-5">
        <DetailHeader
          back={{ href: `/platform/tenants/${tenantId}`, label: t('m_137b646c00feff') }}
          title={t('m_131c0fe5c2d6db', { value0: tenant.name })}
          subtitle={t('m_0ab1807dcc95bd')}
        />
        <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
          <TenantBrandingForm
            key={JSON.stringify(tenant.branding)}
            tenantId={tenantId}
            tenantName={tenant.name}
            saveAction={saveTenantBranding}
            primaryColor={tenant.branding.primaryColor}
            logoUrl={tenant.branding.logoUrl ? tenantBrandAssetUrl(tenantId, 'logo') : undefined}
            letterheadUrl={
              tenant.branding.pdfLetterhead
                ? tenantBrandAssetUrl(tenantId, 'letterhead')
                : undefined
            }
          />
        </section>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">{t('m_137b646c00feff')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}
