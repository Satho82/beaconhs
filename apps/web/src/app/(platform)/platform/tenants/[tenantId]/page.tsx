import Link from "next/link";
import { and, count, desc, eq, isNull } from "drizzle-orm";
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
import {
  orgUnits,
  people,
  platformAuditLog,
  tenantUsers,
  tenants,
} from "@beaconhs/db/schema";
import { requirePlatformOperator } from "@/lib/auth";
import { isUuid } from "@/lib/list-params";
import { PageContainer } from "@/components/page-layout";
import { ConfirmButton } from "@/components/confirm-button";
import { changeTenantLifecycle } from "./_actions";

export const dynamic = "force-dynamic";

export default async function PlatformTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requirePlatformOperator();
  const { tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const data = await withSuperAdmin(db, async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) return null;
    const [memberCount, personCount, propertyCount, audit] = await Promise.all([
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
        .select()
        .from(platformAuditLog)
        .where(eq(platformAuditLog.entityId, tenantId))
        .orderBy(desc(platformAuditLog.occurredAt))
        .limit(10),
    ]);
    return {
      tenant,
      memberCount: Number(memberCount[0]?.value ?? 0),
      personCount: Number(personCount[0]?.value ?? 0),
      propertyCount: Number(propertyCount[0]?.value ?? 0),
      audit,
    };
  });
  if (!data) notFound();
  const { tenant } = data;
  const next = tenant.status === "active" ? "suspended" : "active";

  return (
    <PageContainer>
      <div className="space-y-6">
        <DetailHeader
          back={{ href: "/platform/tenants", label: "Back to tenants" }}
          title={tenant.name}
          subtitle={`${tenant.slug} · ${tenant.region}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={`/platform/tenants/${tenantId}/entitlements`}>
                <Button variant="outline">Modules</Button>
              </Link>
              <form action={changeTenantLifecycle}>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="status" value={next} />
                <ConfirmButton
                  message={`Confirm that you want to ${next === "active" ? "reactivate or restore" : "suspend"} this tenant.`}
                >
                  {next === "active" ? "Reactivate / restore" : "Suspend"}
                </ConfirmButton>
              </form>
              {tenant.status !== "archived" ? (
                <form action={changeTenantLifecycle}>
                  <input type="hidden" name="tenantId" value={tenantId} />
                  <input type="hidden" name="status" value="archived" />
                  <ConfirmButton
                    variant="destructive"
                    message="Archive this tenant? Its data will be retained and it can be restored later."
                  >
                    Archive
                  </ConfirmButton>
                </form>
              ) : null}
            </div>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Status", tenant.status],
            ["Properties", String(data.propertyCount)],
            ["Members", String(data.memberCount)],
            ["People", String(data.personCount)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border bg-white p-4 dark:bg-slate-900"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold">
                <Badge
                  variant={
                    label === "Status" && value === "active"
                      ? "success"
                      : "secondary"
                  }
                >
                  {value}
                </Badge>
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-semibold">Tenant administration</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tenant branding, locale defaults, and communications stay isolated
              from platform-wide settings.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/admin/settings`}>
                <Button variant="outline">Settings</Button>
              </Link>
              <Link href={`/admin/users`}>
                <Button variant="outline">Users</Button>
              </Link>
              <Link href={`/locations`}>
                <Button variant="outline">Properties</Button>
              </Link>
            </div>
          </section>
          <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-semibold">Subscription and templates</h2>
            <p className="mt-1 text-sm text-slate-500">
              Commercial rules are deferred. Existing module entitlements and
              template provisioning remain available.
            </p>
            <div className="mt-4">
              <Link href={`/platform/tenants/${tenantId}/entitlements`}>
                <Button variant="outline">Manage module entitlements</Button>
              </Link>
            </div>
          </section>
        </div>
        <section className="rounded-lg border bg-white p-5 dark:bg-slate-900">
          <h2 className="font-semibold">Recent platform audit activity</h2>
          {data.audit.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No platform activity recorded for this tenant yet." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.occurredAt?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.summary ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
