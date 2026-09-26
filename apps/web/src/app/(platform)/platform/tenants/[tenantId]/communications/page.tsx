import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button, DetailHeader } from "@beaconhs/ui";
import { db, withSuperAdmin } from "@beaconhs/db";
import { tenants } from "@beaconhs/db/schema";
import { requirePlatformOperator } from "@/lib/auth";
import { isUuid } from "@/lib/list-params";
import { PageContainer } from "@/components/page-layout";

export const dynamic = "force-dynamic";
export default async function PlatformTenantCommunicationsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requirePlatformOperator();
  const { tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  );
  if (!tenant) notFound();
  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl space-y-5">
        <DetailHeader
          back={{
            href: `/platform/tenants/${tenantId}`,
            label: "Back to tenant",
          }}
          title={`${tenant.name} communications`}
          subtitle="Safe communications configuration foundation."
        />
        <section className="rounded-lg border bg-white p-5 text-sm dark:bg-slate-900">
          <p>
            Tenant communications use the existing provider policy and
            notification systems. This Platform view intentionally never renders
            provider credentials, API keys, or connection strings.
          </p>
          <p className="mt-3 text-slate-500">
            Provider configuration remains available in the existing tenant and
            platform settings surfaces.
          </p>
        </section>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">Back to tenant</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
