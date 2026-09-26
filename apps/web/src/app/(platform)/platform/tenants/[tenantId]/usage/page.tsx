import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button, DetailHeader } from "@beaconhs/ui";
import { db, withSuperAdmin } from "@beaconhs/db";
import {
  attachments,
  orgUnits,
  people,
  tenantUsers,
  tenants,
} from "@beaconhs/db/schema";
import { requirePlatformOperator } from "@/lib/auth";
import { isUuid } from "@/lib/list-params";
import { PageContainer } from "@/components/page-layout";

export const dynamic = "force-dynamic";

export default async function PlatformTenantUsagePage({
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
    const [members, persons, properties, files] = await Promise.all([
      tx
        .select({ value: count() })
        .from(tenantUsers)
        .where(eq(tenantUsers.tenantId, tenantId)),
      tx
        .select({ value: count() })
        .from(people)
        .where(and(eq(people.tenantId, tenantId), isNull(people.deletedAt))),
      tx
        .select({ value: count() })
        .from(orgUnits)
        .where(
          and(
            eq(orgUnits.tenantId, tenantId),
            eq(orgUnits.level, "site"),
            isNull(orgUnits.deletedAt),
          ),
        ),
      tx
        .select({ value: count() })
        .from(attachments)
        .where(eq(attachments.tenantId, tenantId)),
    ]);
    return {
      tenant,
      metrics: [
        ["Memberships", members],
        ["People", persons],
        ["Properties", properties],
        ["Attachments", files],
      ] as const,
    };
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
          title={`${data.tenant.name} usage`}
          subtitle="Factual operational counts only. Plans, pricing, and commercial limits are not part of Phase 1C."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map(([label, row]) => (
            <div
              key={label}
              className="rounded-lg border bg-white p-4 dark:bg-slate-900"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold">
                {Number(row[0]?.value ?? 0)}
              </p>
            </div>
          ))}
        </div>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">Back to tenant</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
