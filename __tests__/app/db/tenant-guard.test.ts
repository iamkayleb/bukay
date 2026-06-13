import { describe, expect, it } from "vitest";
import { assertTenantWhere } from "@/app/db/tenant-guard";

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
