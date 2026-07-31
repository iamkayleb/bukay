import { describe, expect, it } from "vitest";

import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

describe("tenant-scoped Prisma queries", () => {
  it("accepts only queries matching the active tenant context", () => {
    runWithTenantContext({ tenantId: "tenant-current" }, () => {
      expect(() =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-current", name: "Braids" },
        })
      ).not.toThrow();

      expect(() =>
        assertTenantWhere("Service", "findMany", {
          where: { tenantId: "tenant-other", name: "Braids" },
        })
      ).toThrowError("Service.findMany tenantId does not match the active tenant context");

      expect(() =>
        assertTenantWhere("Service", "findMany", {
          where: { name: "Braids" },
        })
      ).toThrowError("Service.findMany requires a top-level tenantId in where");
    });
  });
});
