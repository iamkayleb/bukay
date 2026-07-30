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
    ).toThrowError("Booking.findMany requires a tenantId in where");
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

  it("accepts a tenantId nested inside AND", () => {
    expect(() =>
      assertTenantWhere("Booking", "findMany", {
        where: { AND: [{ tenantId: "tenant-123" }, { status: "CONFIRMED" }] },
      })
    ).not.toThrow();
  });

  it("rejects OR when a branch lacks tenantId (bypass attempt)", () => {
    expect(() =>
      assertTenantWhere("Booking", "findMany", {
        where: { OR: [{ tenantId: "tenant-123" }, { status: "CONFIRMED" }] },
      })
    ).toThrowError("Booking.findMany requires a tenantId in where");
  });

  it("rejects OR when branches disagree on tenantId", () => {
    expect(() =>
      assertTenantWhere("Booking", "findMany", {
        where: { OR: [{ tenantId: "tenant-123" }, { tenantId: "tenant-456" }] },
      })
    ).toThrowError("Booking.findMany requires a tenantId in where");
  });

  it("accepts OR when every branch pins the same tenantId", () => {
    runWithTenantContext({ tenantId: "tenant-123" }, () => {
      expect(() =>
        assertTenantWhere("Booking", "findMany", {
          where: {
            OR: [
              { tenantId: "tenant-123", status: "CONFIRMED" },
              { tenantId: "tenant-123", status: "PENDING" },
            ],
          },
        })
      ).not.toThrow();
    });
  });

  it("allows the root Tenant model and operations without where clauses", () => {
    expect(() => assertTenantWhere("Tenant", "findMany", {})).not.toThrow();
  });

  it("requires tenantId on create data", () => {
    expect(() =>
      assertTenantWhere("Booking", "create", { data: { status: "CONFIRMED" } })
    ).toThrowError("Booking.create data must include tenantId");
  });

  it("rejects create with mismatched tenantId in active context", () => {
    runWithTenantContext({ tenantId: "tenant-123" }, () => {
      expect(() =>
        assertTenantWhere("Booking", "create", {
          data: { tenantId: "tenant-456", status: "CONFIRMED" },
        })
      ).toThrowError("Booking.create tenantId does not match the active tenant context");
    });
  });

  it("rejects upsert when create payload lacks tenantId", () => {
    expect(() =>
      assertTenantWhere("Booking", "upsert", {
        where: { tenantId: "tenant-123", id: "b1" },
        create: { status: "CONFIRMED" },
        update: { tenantId: "tenant-123", status: "PENDING" },
      })
    ).toThrowError("Booking.upsert create payload must include tenantId");
  });

  it("rejects upsert when update payload carries a foreign tenantId", () => {
    runWithTenantContext({ tenantId: "tenant-123" }, () => {
      expect(() =>
        assertTenantWhere("Booking", "upsert", {
          where: { tenantId: "tenant-123", id: "b1" },
          create: { tenantId: "tenant-123", status: "CONFIRMED" },
          update: { tenantId: "tenant-456", status: "PENDING" },
        })
      ).toThrowError("Booking.upsert update.tenantId does not match the active tenant context");
    });
  });

  it("accepts a well-formed upsert", () => {
    runWithTenantContext({ tenantId: "tenant-123" }, () => {
      expect(() =>
        assertTenantWhere("Booking", "upsert", {
          where: { tenantId: "tenant-123", id: "b1" },
          create: { tenantId: "tenant-123", status: "CONFIRMED" },
          update: { status: "PENDING" },
        })
      ).not.toThrow();
    });
  });

  it("rejects createMany rows missing tenantId", () => {
    expect(() =>
      assertTenantWhere("Booking", "createMany", {
        data: [{ tenantId: "tenant-123" }, { status: "CONFIRMED" }],
      })
    ).toThrowError("Booking.createMany data must include tenantId");
  });
});
