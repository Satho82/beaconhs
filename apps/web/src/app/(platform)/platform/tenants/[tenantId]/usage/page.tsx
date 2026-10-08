import Link from 'next/link'
import { and, count, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { Button, DetailHeader } from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import {
  attachments,
  hospitalityProperties,
  people,
  tenantUsers,
  tenants,
} from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedTranslations, getGeneratedValueTranslations } from '@/i18n/generated.server'

const USAGE_SUBTITLE =
  'Factual operational counts only. Plans, pricing, and commercial limits are not part of Phase 1C.'

export const dynamic = 'force-dynamic'

export default async function PlatformTenantUsagePage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const tGenerated = await getGeneratedTranslations()
  const tGeneratedValue = await getGeneratedValueTranslations()
  await requirePlatformOperator()
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  const data = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) return null
    const [members, persons, properties, files] = await Promise.all([
      tx.select({ value: count() }).from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId)),
      tx
        .select({ value: count() })
        .from(people)
        .where(and(eq(people.tenantId, tenantId), isNull(people.deletedAt))),
      tx
        .select({ value: count() })
        .from(hospitalityProperties)
        .where(
          and(
            eq(hospitalityProperties.tenantId, tenantId),
            isNull(hospitalityProperties.deletedAt),
          ),
        ),
      tx.select({ value: count() }).from(attachments).where(eq(attachments.tenantId, tenantId)),
    ])
    return {
      tenant,
      metrics: [
        [tGenerated('m_1e4c74d78e5d05'), members],
        [tGenerated('m_1e9ca6c7397706'), persons],
        [tGenerated('m_008a1e78d9023f'), properties],
        [tGenerated('m_014ac1a664bf4b'), files],
      ] as const,
    }
  })
  if (!data) notFound()
  return (
    <PageContainer>
      <div className="space-y-5">
        <DetailHeader
          back={{
            href: `/platform/tenants/${tenantId}`,
            label: tGenerated('m_137b646c00feff'),
          }}
          title={tGenerated('m_0587a1b5e457ac', { value0: data.tenant.name })}
          subtitle={tGeneratedValue(USAGE_SUBTITLE)}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map(([label, row]) => (
            <div key={label} className="rounded-lg border bg-white p-4 dark:bg-slate-900">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{Number(row[0]?.value ?? 0)}</p>
            </div>
          ))}
        </div>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">{tGenerated('m_137b646c00feff')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}
