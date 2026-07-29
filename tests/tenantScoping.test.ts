import { describe, expect, it } from "vitest";
import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
};

const services: ServiceRow[] = [
  { id: "service-current", tenantId: "tenant-current", name: "Braids" },
  { id: "service-other", tenantId: "tenant-other", name: "Braids" },
];

function findScopedServices(where: { tenantId: string; name: string }) {
  assertTenantWhere("Service", "findMany", { where });
  return services.filter(
    (service) => service.tenantId === where.tenantId && service.name === where.name
  );
}

describe("tenant-scoped Prisma queries", () => {
  it("returns only the row matching the active tenant context", () => {
    const currentTenantServices = runWithTenantContext({ tenantId: "tenant-current" }, () =>
      findScopedServices({ tenantId: "tenant-current", name: "Braids" })
    );

    expect(currentTenantServices).toHaveLength(1);
    expect(currentTenantServices[0]).toMatchObject({
      id: "service-current",
      tenantId: "tenant-current",
      name: "Braids",
    });
  });

  it("rejects a query for a different tenant than the active tenant context", () => {
    runWithTenantContext({ tenantId: "tenant-current" }, () => {
      expect(() => findScopedServices({ tenantId: "tenant-other", name: "Braids" })).toThrowError(
        "Service.findMany tenantId does not match the active tenant context"
      );
    });
  });
});
