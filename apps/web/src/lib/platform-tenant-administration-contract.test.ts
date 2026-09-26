import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL(
  "../app/(platform)/platform/tenants/[tenantId]/",
  import.meta.url,
);
const read = (name: string) => readFileSync(new URL(name, root), "utf8");

describe("platform tenant administration contract", () => {
  it("keeps every platform tenant mutation behind the direct platform authority guard", () => {
    const actions = read("_actions.ts");
    expect(actions).toContain("requirePlatformOperator()");
    expect(actions).toContain("withSuperAdmin(db");
    expect(actions).toContain("recordPlatformAudit");
    expect(actions).toContain("changeTenantLifecycle");
    expect(actions).toContain("saveTenantPlatformSettings");
  });

  it("keeps tenant administration pages platform-scoped and does not switch tenant context", () => {
    for (const path of [
      "page.tsx",
      "properties/page.tsx",
      "users/page.tsx",
      "usage/page.tsx",
      "audit/page.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("requirePlatformOperator()");
      expect(source, path).toContain("withSuperAdmin(db");
      expect(source, path).not.toContain("setActiveTenant");
      expect(source, path).not.toContain("getRequestContext");
    }
  });

  it("preserves the non-commercial Phase 1C boundary", () => {
    expect(read("usage/page.tsx")).toContain(
      "Plans, pricing, and commercial limits are not part of Phase 1C.",
    );
    expect(read("communications/page.tsx")).toContain(
      "never renders provider credentials, API keys, or connection strings",
    );
  });
});
