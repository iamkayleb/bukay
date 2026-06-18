import { describe, expect, it, vi } from "vitest";
import { assertTenantWhere } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

vi.mock("@prisma/client", () => ({
  Prisma: {
    defineExtension: vi.fn((extension) => extension),
  },
}));

describe("assertTenantWhere", () => {
  it("rejects a tenant-scoped query without a tenantId", () => {
    expect(() =>
      assertTenantWhere("Booking", "findMany", { where: { status: "CONFIRMED" } })
    ).toThrowError("Booking.findMany requires a top-level tenantId in where");
  });

  it("accepts a tenant-scoped query with a tenantId", () => {
    expect(() =>
      assertTenantWhere("Booking", "findMany", { where: { tenantId: "tenant-123" } })
    ).not.toThrow();
  });

  it("rejects a query for a different tenant than the active context", () => {
    runWithTenantContext({ tenantId: "tenant-123" }, () => {
      expect(() =>
        assertTenantWhere("Booking", "findMany", { where: { tenantId: "tenant-456" } })
      ).toThrowError("Booking.findMany tenantId does not match the active tenant context");
    });
  });

  it("accepts a query for the active tenant context", () => {
    runWithTenantContext({ tenantId: "tenant-123" }, () => {
      expect(() =>
        assertTenantWhere("Booking", "findMany", {
          where: { tenantId: { equals: "tenant-123" } },
        })
      ).not.toThrow();
    });
  });

  it("rejects a tenantId nested inside an OR clause", () => {
    expect(() =>
      assertTenantWhere("Booking", "findMany", {
        where: { OR: [{ tenantId: "tenant-123" }, { status: "CONFIRMED" }] },
      })
    ).toThrowError("Booking.findMany requires a top-level tenantId in where");
  });

  it("allows the root Tenant model and operations without where clauses", () => {
    expect(() => assertTenantWhere("Tenant", "findMany", {})).not.toThrow();
    expect(() => assertTenantWhere("Booking", "create", {})).not.toThrow();
  });
});
