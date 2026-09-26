import Link from "next/link";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { notFound } from "next/navigation";
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
} from "@beaconhs/ui";
import { db, withSuperAdmin } from "@beaconhs/db";
import { tenantUsers, tenants, users } from "@beaconhs/db/schema";
import { requirePlatformOperator } from "@/lib/auth";
import { isUuid, pickString } from "@/lib/list-params";
import { PageContainer } from "@/components/page-layout";
import { SearchInput } from "@/components/search-input";
import { TableToolbar } from "@/components/table-toolbar";

export const dynamic = "force-dynamic";

export default async function PlatformTenantUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  const { tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const q = pickString((await searchParams).q)?.trim();
  const data = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) return null;
    const search = q
      ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`))
      : undefined;
    const rows = await tx
      .select({ membership: tenantUsers, user: users })
      .from(tenantUsers)
      .innerJoin(users, eq(users.id, tenantUsers.userId))
      .where(and(eq(tenantUsers.tenantId, tenantId), search))
      .orderBy(asc(users.name))
      .limit(100);
    return { tenant, rows };
  });
  if (!data) notFound();
  return (
    <PageContainer>
      <div className="space-y-5">
        <DetailHeader
          back={{
            href: `/platform/tenants/${tenantId}`,
            label: "Back to tenant",
          }}
          title={`${data.tenant.name} users`}
          subtitle="Memberships are tenant-scoped; people may belong to multiple properties."
        />
        <TableToolbar>
          <SearchInput placeholder="Search users" />
        </TableToolbar>
        {data.rows.length === 0 ? (
          <EmptyState title="No memberships found." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Locale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map(({ membership, user }) => (
                <TableRow key={membership.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        membership.status === "active" ? "success" : "secondary"
                      }
                    >
                      {membership.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {membership.localeOverride ?? "Tenant default"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">Back to tenant</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
