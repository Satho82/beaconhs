import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, DetailHeader } from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import { tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { GeneratedText } from '@/i18n/generated'
import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'

const PROVIDER_CREDENTIALS_BOUNDARY =
  'never renders provider credentials, API keys, or connection strings'

export const dynamic = 'force-dynamic'
export default async function PlatformTenantCommunicationsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const tGenerated = await getGeneratedTranslations()
  const tGeneratedValue = await getGeneratedValueTranslations()
  await requirePlatformOperator()
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
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
          title={tGenerated('m_1f69ac7060f842', { value0: tenant.name })}
          subtitle={tGenerated('m_1c96536d65a117')}
        />
        <section className="rounded-lg border bg-white p-5 text-sm dark:bg-slate-900">
          <p>
            <GeneratedText id="m_09908c92ac5925" /> {tGeneratedValue(PROVIDER_CREDENTIALS_BOUNDARY)}
            .
          </p>
          <p className="mt-3 text-slate-500">
            <GeneratedText id="m_18bb2a72930fbb" />
          </p>
        </section>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">
            <GeneratedText id="m_137b646c00feff" />
          </Button>
        </Link>
      </div>
    </PageContainer>
  )
}
