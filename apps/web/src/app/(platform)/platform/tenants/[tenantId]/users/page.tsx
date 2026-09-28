import Link from 'next/link'
import { and, asc, eq, ilike, or } from 'drizzle-orm'
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
import { tenantUsers, tenants, users } from '@beaconhs/db/schema'
import { requirePlatformOperator } from '@/lib/auth'
import { isUuid, pickString } from '@/lib/list-params'
import { PageContainer } from '@/components/page-layout'
import { SearchInput } from '@/components/search-input'
import { TableToolbar } from '@/components/table-toolbar'
import { getGeneratedTranslations } from '@/i18n/generated.server'
import { openTenantUserInvite } from '../_actions'

export const dynamic = 'force-dynamic'

export default async function PlatformTenantUsersPage({
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
    const search = q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined
    const rows = await tx
      .select({ membership: tenantUsers, user: users })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, tenantId), search))
      .orderBy(asc(users.name))
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
          title={tGenerated('m_0c189be0010dcc', { value0: data.tenant.name })}
          subtitle={tGenerated('m_09e068a48ef311')}
        />
        <TableToolbar>
          <SearchInput placeholder={tGenerated('m_086b4fc4bde8f5')} />
          <form action={openTenantUserInvite}>
            <input type="hidden" name="tenantId" value={tenantId} />
            <Button type="submit">Add user</Button>
          </form>
        </TableToolbar>
        {data.rows.length === 0 ? (
          <EmptyState title={tGenerated('m_07295baa7ba277')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tGenerated('m_02b18d5c7f6f2d')}</TableHead>
                <TableHead>{tGenerated('m_00a0ba9938bdff')}</TableHead>
                <TableHead>{tGenerated('m_0b9da892d6faf0')}</TableHead>
                <TableHead>{tGenerated('m_0e732f319c37c9')}</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map(({ membership, user }) => (
                <TableRow key={membership.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={membership.status === 'active' ? 'success' : 'secondary'}>
                      {membership.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {membership.localeOverride ?? tGenerated('m_1a6597dd1c00f3')}
                  </TableCell>
                  <TableCell>
                    <Link href={`/platform/users/${user.id}`}>
                      <Button variant="outline">Manage</Button>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/platform/users/${user.id}`}>
                      <Button variant="outline">Manage</Button>
                    </Link>
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
