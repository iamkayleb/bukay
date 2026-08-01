import { describe, expect, it } from "vitest";

import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

describe("tenant-scoped Prisma queries", () => {
  it("allows where clauses matching the active tenant context", () => {
    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-current", name: "Braids" },
        })
      )
    ).not.toThrow();
  });

  it("rejects where clauses for a different tenant context", () => {
    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-other", name: "Braids" },
        })
      )
    ).toThrow("Service.findMany tenantId does not match the active tenant context");
  });
});
