"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, withSuperAdmin } from "@beaconhs/db";
import { tenants } from "@beaconhs/db/schema";
import { requirePlatformOperator } from "@/lib/auth";
import { recordPlatformAudit } from "@/lib/platform-audit";
import { isUuid } from "@/lib/list-params";

const lifecycleStates = new Set(["active", "suspended", "archived"]);

/** Platform-only tenant lifecycle mutation. Tenant rows are retained permanently. */
export async function changeTenantLifecycle(formData: FormData): Promise<void> {
  const operator = await requirePlatformOperator();
  const tenantId = String(formData.get("tenantId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isUuid(tenantId) || !lifecycleStates.has(status))
    throw new Error("Invalid tenant lifecycle request.");

  const [changed] = await withSuperAdmin(db, async (tx) =>
    tx
      .update(tenants)
      .set({
        status: status as "active" | "suspended" | "archived",
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning({
        id: tenants.id,
        name: tenants.name,
        status: tenants.status,
      }),
  );
  if (!changed) throw new Error("Tenant not found.");

  await recordPlatformAudit(operator, {
    entityType: "tenant",
    entityId: changed.id,
    action: `lifecycle.${status}`,
    summary: `${status === "active" ? "Activated or restored" : status === "suspended" ? "Suspended" : "Archived"} tenant ${changed.name}`,
    after: { status: changed.status },
  });
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
}
