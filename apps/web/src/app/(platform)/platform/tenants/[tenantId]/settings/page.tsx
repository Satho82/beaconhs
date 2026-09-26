import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button, DetailHeader, Input, Label, Select } from "@beaconhs/ui";
import { db, withSuperAdmin } from "@beaconhs/db";
import { tenants } from "@beaconhs/db/schema";
import { requirePlatformOperator } from "@/lib/auth";
import { isUuid } from "@/lib/list-params";
import { PageContainer } from "@/components/page-layout";
import { saveTenantPlatformSettings } from "../_actions";

export const dynamic = "force-dynamic";
export default async function PlatformTenantSettingsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requirePlatformOperator();
  const { tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const [tenant] = await withSuperAdmin(db, (tx) =>
    tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
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
          title={`${tenant.name} settings`}
          subtitle="Tenant metadata and locale defaults. Sensitive changes are platform-audited."
        />
        <form
          action={saveTenantPlatformSettings}
          className="space-y-4 rounded-lg border bg-white p-5 dark:bg-slate-900"
        >
          <input type="hidden" name="tenantId" value={tenantId} />
          <Label>
            Region
            <Input name="region" defaultValue={tenant.region} required />
          </Label>
          <Label>
            Default language
            <Select
              name="defaultLanguage"
              defaultValue={tenant.defaultLanguage}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
            </Select>
          </Label>
          <Button type="submit">Save settings</Button>
        </form>
        <Link href={`/platform/tenants/${tenantId}`}>
          <Button variant="outline">Back to tenant</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
