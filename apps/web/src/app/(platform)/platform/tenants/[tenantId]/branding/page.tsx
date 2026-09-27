import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, DetailHeader } from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedTranslations } from '@/i18n/generated.server'

export const dynamic = 'force-dynamic'
export default async function PlatformTenantBrandingPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const tGenerated = await getGeneratedTranslations()
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
          back={{
            href: `/platform/tenants/${tenantId}`,
            label: tGenerated('m_137b646c00feff'),
          }}
          title={tGenerated('m_131c0fe5c2d6db', { value0: tenant.name })}
          subtitle={tGenerated('m_0ab1807dcc95bd')}
        />
        <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">{tGenerated('m_0b4e6d5c6d8b13')}</dt>
              <dd>{tenant.branding.logoUrl ?? tGenerated('m_0263bb55629510')}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{tGenerated('m_112bc8c304a288')}</dt>
              <dd>{tenant.branding.primaryColor ?? tGenerated('m_0263bb55629510')}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{tGenerated('m_1231713b7692b2')}</dt>
              <dd>{tenant.branding.pdfLetterhead ?? tGenerated('m_0263bb55629510')}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm text-slate-500">{tGenerated('m_1abeec7101089e')}</p>
        </section>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">{tGenerated('m_137b646c00feff')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}
