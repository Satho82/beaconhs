import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
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
} from "@beaconhs/ui";
import { db, withSuperAdmin } from "@beaconhs/db";
import { platformAuditLog, tenants, users } from "@beaconhs/db/schema";
import { requirePlatformOperator } from "@/lib/auth";
import { isUuid } from "@/lib/list-params";
import { PageContainer } from "@/components/page-layout";

export const dynamic = "force-dynamic";

export default async function PlatformTenantAuditPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requirePlatformOperator();
  const { tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const data = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) return null;
    const rows = await tx
      .select({ audit: platformAuditLog, actor: users })
      .from(platformAuditLog)
      .leftJoin(users, eq(users.id, platformAuditLog.actorUserId))
      .where(eq(platformAuditLog.entityId, tenantId))
      .orderBy(desc(platformAuditLog.occurredAt))
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
          title={`${data.tenant.name} platform audit`}
          subtitle="Platform lifecycle and sensitive administration events."
        />
        {data.rows.length === 0 ? (
          <EmptyState title="No platform audit activity recorded for this tenant yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map(({ audit, actor }) => (
                <TableRow key={audit.id}>
                  <TableCell>
                    {audit.occurredAt?.toLocaleString() ?? "—"}
                  </TableCell>
                  <TableCell>{actor?.email ?? "System"}</TableCell>
                  <TableCell>{audit.action}</TableCell>
                  <TableCell>{audit.summary ?? "—"}</TableCell>
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
