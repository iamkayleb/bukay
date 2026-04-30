import { describe, it, expect } from "vitest";
import {
  assertTenantScoped,
  TenantGuardError,
  extractTenantIdFromWhere,
} from "../prismaWithTenantGuard";
import { tenantContext } from "../tenantContext";

// ---------------------------------------------------------------------------
// extractTenantIdFromWhere — unit tests for all supported where shapes
// ---------------------------------------------------------------------------

describe("extractTenantIdFromWhere", () => {
  it("extracts a direct string tenantId", () => {
    expect(extractTenantIdFromWhere({ tenantId: "abc" })).toBe("abc");
  });

  it("extracts tenantId from { tenantId: { equals: '...' } }", () => {
    expect(extractTenantIdFromWhere({ tenantId: { equals: "abc" } })).toBe(
      "abc"
    );
  });

  it("extracts tenantId array from { tenantId: { in: [...] } }", () => {
    expect(extractTenantIdFromWhere({ tenantId: { in: ["a", "b"] } })).toEqual([
      "a",
      "b",
    ]);
  });

  it("extracts tenantId from top-level AND clause", () => {
    expect(
      extractTenantIdFromWhere({
        AND: [{ tenantId: "abc" }, { status: "active" }],
      })
    ).toBe("abc");
  });

  it("extracts tenantId from nested AND clause", () => {
    expect(
      extractTenantIdFromWhere({ AND: [{ AND: [{ tenantId: "deep" }] }] })
    ).toBe("deep");
  });

  it("returns null when tenantId is absent", () => {
    expect(extractTenantIdFromWhere({ id: "123" })).toBeNull();
  });

  it("returns null for empty where", () => {
    expect(extractTenantIdFromWhere({})).toBeNull();
  });

  it("returns null when tenantId is null", () => {
    expect(extractTenantIdFromWhere({ tenantId: null })).toBeNull();
  });

  it("returns null when tenantId is undefined", () => {
    expect(extractTenantIdFromWhere({ tenantId: undefined })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// assertTenantScoped — complex where clause shapes (no active context)
// ---------------------------------------------------------------------------

describe("assertTenantScoped — complex where shapes (no context)", () => {
  it("passes for { tenantId: { equals: 'abc' } }", () => {
    expect(() =>
      assertTenantScoped("User", "findMany", {
        where: { tenantId: { equals: "abc" } },
      })
    ).not.toThrow();
  });

  it("passes for { tenantId: { in: ['a', 'b'] } }", () => {
    expect(() =>
      assertTenantScoped("User", "findMany", {
        where: { tenantId: { in: ["a", "b"] } },
      })
    ).not.toThrow();
  });

  it("passes for { AND: [{ tenantId: 'abc' }] }", () => {
    expect(() =>
      assertTenantScoped("User", "findMany", {
        where: { AND: [{ tenantId: "abc" }, { isActive: true }] },
      })
    ).not.toThrow();
  });

  it(
    "throws for { tenantId: { in: [] } } — empty in list provides no tenant",
    () => {
      // An empty in list means no tenant is being targeted — guard should block it
      expect(() =>
        assertTenantScoped("User", "findMany", {
          where: { tenantId: { in: [] } },
        })
      ).toThrow(TenantGuardError);
    }
  );

  it("throws when AND clause has no tenantId", () => {
    expect(() =>
      assertTenantScoped("User", "findMany", {
        where: { AND: [{ status: "active" }, { isVerified: true }] },
      })
    ).toThrow(TenantGuardError);
  });
});

// ---------------------------------------------------------------------------
// assertTenantScoped — context validation with complex shapes
// ---------------------------------------------------------------------------

describe("assertTenantScoped — context validation with complex shapes", () => {
  it(
    "passes for { tenantId: { equals: contextId } } when context matches",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-x", tenantSlug: "tenant-x" },
          () => {
            expect(() =>
              assertTenantScoped("Booking", "findMany", {
                where: { tenantId: { equals: "tenant-x" } },
              })
            ).not.toThrow();
            resolve();
          }
        );
      });
    }
  );

  it(
    "throws for { tenantId: { equals: otherId } } when context differs",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-x", tenantSlug: "tenant-x" },
          () => {
            expect(() =>
              assertTenantScoped("Booking", "findMany", {
                where: { tenantId: { equals: "tenant-y" } },
              })
            ).toThrow(TenantGuardError);
            resolve();
          }
        );
      });
    }
  );

  it(
    "passes for { tenantId: { in: [contextId, ...] } } when context is in list",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-a", tenantSlug: "tenant-a" },
          () => {
            expect(() =>
              assertTenantScoped("User", "findMany", {
                where: { tenantId: { in: ["tenant-a", "tenant-b"] } },
              })
            ).not.toThrow();
            resolve();
          }
        );
      });
    }
  );

  it(
    "throws for { tenantId: { in: [...] } } when context is NOT in list",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-c", tenantSlug: "tenant-c" },
          () => {
            expect(() =>
              assertTenantScoped("User", "findMany", {
                where: { tenantId: { in: ["tenant-a", "tenant-b"] } },
              })
            ).toThrow(TenantGuardError);
            resolve();
          }
        );
      });
    }
  );

  it(
    "passes for { AND: [{ tenantId: contextId }] } when context matches",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-x", tenantSlug: "tenant-x" },
          () => {
            expect(() =>
              assertTenantScoped("Client", "findMany", {
                where: { AND: [{ tenantId: "tenant-x" }, { status: "active" }] },
              })
            ).not.toThrow();
            resolve();
          }
        );
      });
    }
  );

  it(
    "throws for { AND: [{ tenantId: otherId }] } when context differs",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-x", tenantSlug: "tenant-x" },
          () => {
            expect(() =>
              assertTenantScoped("Client", "findMany", {
                where: { AND: [{ tenantId: "tenant-y" }, { status: "active" }] },
              })
            ).toThrow(TenantGuardError);
            resolve();
          }
        );
      });
    }
  );
});
