import Link from 'next/link'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import {
  Badge,
  Button,
  DetailHeader,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import {
  hospitalityProperties,
  people,
  platformAuditLog,
  tenantUsers,
  tenants,
} from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { ConfirmButton } from '@/components/confirm-button'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { changeTenantLifecycle, repairTenantBaseline } from './_actions'

export const dynamic = 'force-dynamic'

export default async function PlatformTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const tGenerated = await getGeneratedTranslations()
  await requirePlatformOperator()
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  const data = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    if (!tenant) return null
    const [memberCount, personCount, propertyCount, audit] = await Promise.all([
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
      tx
        .select()
        .from(platformAuditLog)
        .where(eq(platformAuditLog.entityId, tenantId))
        .orderBy(desc(platformAuditLog.occurredAt))
        .limit(10),
    ])
    return {
      tenant,
      memberCount: Number(memberCount[0]?.value ?? 0),
      personCount: Number(personCount[0]?.value ?? 0),
      propertyCount: Number(propertyCount[0]?.value ?? 0),
      audit,
    }
  })
  if (!data) notFound()
  const { tenant } = data
  const next = tenant.status === 'active' ? 'suspended' : 'active'

  return (
    <PageContainer>
      <div className="space-y-6">
        <DetailHeader
          back={{ href: '/platform/tenants', label: tGenerated('m_1ae3d6b35d64a6') }}
          title={tenant.name}
          subtitle={`${tenant.slug} · ${tenant.region}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={`/platform/tenants/${tenantId}/entitlements`}>
                <Button variant="outline">{tGenerated('m_03abc46dafbce6')}</Button>
              </Link>
              <form action={repairTenantBaseline}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <ConfirmButton variant="outline" message={tGenerated('m_069587d01e3b06')}>
                  {tGenerated('m_0dc6071788cc08')}
                </ConfirmButton>
              </form>
              <form action={changeTenantLifecycle}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="status" value={next} />
                <ConfirmButton
                  message={tGenerated('m_193e1503bfd6c3', {
                    value0: tGenerated(next === 'active' ? 'm_0c7f9f5175d662' : 'm_1a04688da0adf6'),
                  })}
                >
                  {tGenerated(next === 'active' ? 'm_0c7f9f5175d662' : 'm_1a04688da0adf6')}
                </ConfirmButton>
              </form>
              {tenant.status !== 'archived' ? (
                <form action={changeTenantLifecycle}>
                  <input type="hidden" name="tenantId" value={tenantId} />
                  <input type="hidden" name="status" value="archived" />
                  <ConfirmButton variant="destructive" message={tGenerated('m_040f3aeedd17f1')}>
                    {tGenerated('m_019c0a64030688')}
                  </ConfirmButton>
                </form>
              ) : null}
            </div>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [tGenerated('m_0b9da892d6faf0'), tenant.status],
            [tGenerated('m_008a1e78d9023f'), String(data.propertyCount)],
            [tGenerated('m_0ef3898622f868'), String(data.memberCount)],
            [tGenerated('m_1e9ca6c7397706'), String(data.personCount)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-white p-4 dark:bg-slate-900">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold">
                <Badge
                  variant={
                    label === tGenerated('m_0b9da892d6faf0') && value === 'active'
                      ? 'success'
                      : 'secondary'
                  }
                >
                  {value}
                </Badge>
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-semibold">{tGenerated('m_02390870f084f4')}</h2>
            <p className="mt-1 text-sm text-slate-500">{tGenerated('m_0a1d2a87f379d5')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/platform/tenants/${tenantId}/users`}>
                <Button variant="outline">{tGenerated('m_1324d0c784a75e')}</Button>
              </Link>
              <Link href={`/platform/tenants/${tenantId}/properties`}>
                <Button variant="outline">{tGenerated('m_008a1e78d9023f')}</Button>
              </Link>
              <Link href={`/platform/tenants/${tenantId}/usage`}>
                <Button variant="outline">{tGenerated('m_0ae3b4ff7213f7')}</Button>
              </Link>
              <Link href={`/platform/tenants/${tenantId}/audit`}>
                <Button variant="outline">{tGenerated('m_1d28c8cb329851')}</Button>
              </Link>
              <Link href={`/platform/tenants/${tenantId}/settings`}>
                <Button variant="outline">{tGenerated('m_151769a9fde954')}</Button>
              </Link>
              <Link href={`/platform/tenants/${tenantId}/branding`}>
                <Button variant="outline">{tGenerated('m_009d942e2e5b0f')}</Button>
              </Link>
              <Link href={`/platform/tenants/${tenantId}/communications`}>
                <Button variant="outline">{tGenerated('m_1ed5f249bf011f')}</Button>
              </Link>
            </div>
          </section>
          <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-semibold">{tGenerated('m_0077675f6d0926')}</h2>
            <p className="mt-1 text-sm text-slate-500">{tGenerated('m_10c853125c3097')}</p>
            <div className="mt-4">
              <Link href={`/platform/tenants/${tenantId}/entitlements`}>
                <Button variant="outline">{tGenerated('m_161a074d5201d2')}</Button>
              </Link>
            </div>
          </section>
        </div>
        <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
          <h2 className="font-semibold">{tGenerated('m_181b32011bc7eb')}</h2>
          {data.audit.length === 0 ? (
            <div className="mt-3">
              <EmptyState title={tGenerated('m_123750c9022b4a')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tGenerated('m_13cc128f69897c')}</TableHead>
                  <TableHead>{tGenerated('m_0bad495a7046e9')}</TableHead>
                  <TableHead>{tGenerated('m_031c356c80b70f')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.occurredAt?.toLocaleString() ?? '—'}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.summary ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </PageContainer>
  )
}
