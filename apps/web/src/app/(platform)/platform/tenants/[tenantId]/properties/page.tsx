import Link from 'next/link'
import { and, asc, eq, ilike, or } from 'drizzle-orm'
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
  Input,
  Label,
} from '@beaconhs/ui'
import { db, withSuperAdmin } from '@beaconhs/db'
import { hospitalityProperties, tenants } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid, pickString } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { SearchInput } from '@/components/search-input'
import { TableToolbar } from '@/components/table-toolbar'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { ConfirmButton } from '@/components/confirm-button'
import { saveTenantProperty, setTenantPropertyArchived } from '../_actions'

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
      ? or(ilike(hospitalityProperties.name, `%${q}%`), ilike(hospitalityProperties.code, `%${q}%`))
      : undefined
    const rows = await tx
      .select()
      .from(hospitalityProperties)
      .where(and(eq(hospitalityProperties.tenantId, tenantId), search))
      .orderBy(asc(hospitalityProperties.name))
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
        <form
          action={saveTenantProperty}
          className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-4 dark:bg-slate-900"
        >
          <input type="hidden" name="tenantId" value={tenantId} />
          <div>
            <Label htmlFor="property-name">{tGenerated('m_1db4bb1e2f8e4b')}</Label>
            <Input id="property-name" name="name" required />
          </div>
          <div>
            <Label htmlFor="property-code">{tGenerated('m_09442c9bd77b7c')}</Label>
            <Input id="property-code" name="code" required />
          </div>
          <div>
            <Label htmlFor="property-timezone">{tGenerated('m_18dd6072735a83')}</Label>
            <Input id="property-timezone" name="timezone" defaultValue="Europe/London" required />
          </div>
          <div className="flex items-end">
            <Button type="submit">{tGenerated('m_067cc738ffbd0e')}</Button>
          </div>
        </form>
        {data.rows.length === 0 ? (
          <EmptyState title={tGenerated('m_0b61b4e57e2c10')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tGenerated('m_0f7a8c3e57d104')}</TableHead>
                <TableHead>{tGenerated('m_0570e24c85cf95')}</TableHead>
                <TableHead>{tGenerated('m_02d326d09a4cc1')}</TableHead>
                <TableHead>{tGenerated('m_182e5fe6708eb9')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.code ?? '—'}</TableCell>
                  <TableCell>{row.timezone}</TableCell>
                  <TableCell>
                    <form action={setTenantPropertyArchived}>
                      <input type="hidden" name="tenantId" value={tenantId} />
                      <input type="hidden" name="propertyId" value={row.id} />
                      <input type="hidden" name="archived" value={row.deletedAt ? 'off' : 'on'} />
                      <ConfirmButton
                        variant={row.deletedAt ? 'outline' : 'destructive'}
                        message={
                          row.deletedAt
                            ? tGenerated('m_1b2fcbf61bf7d0', { value0: row.name })
                            : tGenerated('m_07b203e7f70673', { value0: row.name })
                        }
                      >
                        {row.deletedAt
                          ? tGenerated('m_19500e41842c99')
                          : tGenerated('m_16a01dc21eb543')}
                      </ConfirmButton>
                    </form>
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
