import Link from 'next/link'
import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm'
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
import { orgUnits, tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid, pickString } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { SearchInput } from '@/components/search-input'
import { TableToolbar } from '@/components/table-toolbar'
import { getGeneratedTranslations } from '@/i18n/generated.server'

export const dynamic = 'force-dynamic'

/** Cross-tenant control-centre property list. It deliberately does not enter tenant context. */
export default async function PlatformTenantPropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const tGenerated = await getGeneratedTranslations()
  await requirePlatformOperator()
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  const q = pickString((await searchParams).q)?.trim()
  const data = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    if (!tenant) return null
    const search = q
      ? or(ilike(orgUnits.name, `%${q}%`), ilike(orgUnits.code, `%${q}%`))
      : undefined
    const rows = await tx
      .select()
      .from(orgUnits)
      .where(
        and(
          eq(orgUnits.tenantId, tenantId),
          eq(orgUnits.level, 'site'),
          isNull(orgUnits.deletedAt),
          search,
        ),
      )
      .orderBy(asc(orgUnits.name))
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
          title={tGenerated('m_06695810862661', { value0: data.tenant.name })}
          subtitle={tGenerated('m_0a75d98b8226b6')}
        />
        <TableToolbar>
          <SearchInput placeholder={tGenerated('m_156ed186e78b53')} />
        </TableToolbar>
        {data.rows.length === 0 ? (
          <EmptyState title={tGenerated('m_0b61b4e57e2c10')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tGenerated('m_0f7a8c3e57d104')}</TableHead>
                <TableHead>{tGenerated('m_0570e24c85cf95')}</TableHead>
                <TableHead>{tGenerated('m_02d326d09a4cc1')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.code ?? '—'}</TableCell>
                  <TableCell>
                    {[row.address?.line1, row.address?.city, row.address?.region]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </TableCell>
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
