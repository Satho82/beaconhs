import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import {
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
import { platformAuditLog, tenants, users } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { getGeneratedTranslations } from '@/i18n/generated.server'

export const dynamic = 'force-dynamic'

export default async function PlatformTenantAuditPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const tGenerated = await getGeneratedTranslations()
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
    const rows = await tx
      .select({ audit: platformAuditLog, actor: users })
      .from(platformAuditLog)
      .leftJoin(users, eq(users.id, platformAuditLog.actorUserId))
      .where(eq(platformAuditLog.entityId, tenantId))
      .orderBy(desc(platformAuditLog.occurredAt))
      .limit(100)
    return { tenant, rows }
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
          title={tGenerated('m_1245c352841dec', { value0: data.tenant.name })}
          subtitle={tGenerated('m_05677b8a5f2c80')}
        />
        {data.rows.length === 0 ? (
          <EmptyState title={tGenerated('m_023cb62b4c49be')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tGenerated('m_13cc128f69897c')}</TableHead>
                <TableHead>{tGenerated('m_163dfc4f85857d')}</TableHead>
                <TableHead>{tGenerated('m_0bad495a7046e9')}</TableHead>
                <TableHead>{tGenerated('m_031c356c80b70f')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map(({ audit, actor }) => (
                <TableRow key={audit.id}>
                  <TableCell>{audit.occurredAt?.toLocaleString() ?? '—'}</TableCell>
                  <TableCell>{actor?.email ?? tGenerated('m_08f7a859552ffa')}</TableCell>
                  <TableCell>{audit.action}</TableCell>
                  <TableCell>{audit.summary ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">{tGenerated('m_137b646c00feff')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}
