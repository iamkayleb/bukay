import { describe, expect, it, vi } from "vitest";
import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

describe("tenant-scoped Prisma queries", () => {
  it("passes queries that match the active tenant context to Prisma", () => {
    const query = vi.fn((args: unknown) => args);
    const args = { where: { tenantId: "tenant-current", name: "Braids" } };

    const result = runWithTenantContext({ tenantId: "tenant-current" }, () => {
      assertTenantWhere("Service", "findMany", args);
      return query(args);
    });

    expect(query).toHaveBeenCalledWith(args);
    expect(result).toBe(args);
  });
});
