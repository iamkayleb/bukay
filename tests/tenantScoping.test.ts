import { describe, expect, it } from "vitest";

import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

describe("tenant-scoped Prisma queries", () => {
  it("allows queries scoped to the active tenant context", () => {
    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () => {
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-current", name: "Braids" },
        });
      })
    ).not.toThrow();
  });

  it("rejects queries missing a tenantId", () => {
    expect(() => {
      assertTenantWhere("Service", "findMany", { where: { name: "Braids" } });
    }).toThrow("Service.findMany requires a top-level tenantId in where");
  });

  it("rejects queries for a different tenant context", () => {
    expect(() =>
      runWithTenantContext({ tenantId: "tenant-current" }, () => {
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-other", name: "Braids" },
        });
      })
    ).toThrow("Service.findMany tenantId does not match the active tenant context");
  });
});
