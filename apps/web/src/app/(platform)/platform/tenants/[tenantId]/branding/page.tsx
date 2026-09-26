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
export default async function PlatformTenantBrandingPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requirePlatformOperator();
  const { tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx
      .select({ name: tenants.name, branding: tenants.branding })
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
          title={`${tenant.name} branding`}
          subtitle="Tenant branding is separate from Platform Branding."
        />
        <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Logo URL</dt>
              <dd>{tenant.branding.logoUrl ?? "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Primary colour</dt>
              <dd>{tenant.branding.primaryColor ?? "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">PDF letterhead</dt>
              <dd>{tenant.branding.pdfLetterhead ?? "Not configured"}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm text-slate-500">
            This foundation keeps branding tenant-specific and is compatible
            with a later managed logo-upload flow.
          </p>
        </section>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">Back to tenant</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
