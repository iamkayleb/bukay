import { describe, expect, it } from "vitest";
import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

describe("tenant-scoped Prisma queries", () => {
  it("allows matching tenant-scoped queries", () => {
    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-current", name: "Braids" },
        })
      )
    ).not.toThrow();
  });

  it("rejects cross-tenant queries", () => {
    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-other", name: "Braids" },
        })
      )
    ).toThrow("tenantId does not match the active tenant context");
  });

  it("rejects unscoped tenant model queries", () => {
    expect(() =>
      assertTenantWhere("Service", "findMany", {
        where: { name: "Braids" },
      })
    ).toThrow("Service.findMany requires a top-level tenantId in where");
  });
});
