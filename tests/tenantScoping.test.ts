import { describe, expect, it } from "vitest";

import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

describe("tenant-scoped Prisma queries", () => {
  it("allows only the row matching the active tenant context", () => {
    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-current", name: "Braids" },
        })
      )
    ).not.toThrow();

    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-other", name: "Braids" },
        })
      )
    ).toThrow("Service.findMany tenantId does not match the active tenant context");
  });
});
