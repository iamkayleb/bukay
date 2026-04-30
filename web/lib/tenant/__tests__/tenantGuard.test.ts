import { describe, it, expect, vi } from "vitest";
import {
  assertTenantScoped,
  TenantGuardError,
  TENANT_SCOPED_MODELS,
  withTenantGuard,
} from "../prismaWithTenantGuard";
import { extractSubdomainSlug, resolveTenant } from "../resolveTenant";
import {
  tenantContext,
  getTenantId,
  getTenantIdOrNull,
  getTenantSlug,
  getTenantSlugOrNull,
  getTenantContext,
} from "../tenantContext";
import { withTenantContext } from "../withTenantContext";

function makeReq(host: string, cookieSlug?: string) {
  return {
    headers: { get: (key: string) => (key === "host" ? host : null) },
    cookies: {
      get: (key: string) =>
        key === "tenantSlug" && cookieSlug ? { value: cookieSlug } : undefined,
    },
  } as unknown as import("next/server").NextRequest;
}

// ---------------------------------------------------------------------------
// assertTenantScoped
// ---------------------------------------------------------------------------

describe("assertTenantScoped", () => {
  it("throws TenantGuardError when tenantId is absent from where", () => {
    expect(() => assertTenantScoped("User", "findMany", { where: {} })).toThrow(
      TenantGuardError
    );
  });

  it("throws when where is undefined", () => {
    expect(() => assertTenantScoped("Booking", "findMany", {})).toThrow(
      TenantGuardError
    );
  });

  it("throws for all guarded operations on tenant-scoped models", () => {
    const ops = [
      "findFirst",
      "findFirstOrThrow",
      "update",
      "updateMany",
      "upsert",
      "delete",
      "deleteMany",
    ];
    for (const op of ops) {
      expect(() => assertTenantScoped("Client", op, { where: {} })).toThrow(
        TenantGuardError
      );
    }
  });

  it("does NOT throw when tenantId is present in where", () => {
    expect(() =>
      assertTenantScoped("User", "findMany", {
        where: { tenantId: "tenant-abc" },
      })
    ).not.toThrow();
  });

  it("does NOT throw for Tenant model (not tenant-scoped)", () => {
    expect(() =>
      assertTenantScoped("Tenant", "findMany", { where: {} })
    ).not.toThrow();
  });

  it(
    "does NOT throw for create operation (tenantId lives in data, not where)",
    () => {
      expect(() =>
        assertTenantScoped("User", "create", { where: {} })
      ).not.toThrow();
    }
  );

  it("covers all models listed in TENANT_SCOPED_MODELS", () => {
    for (const model of Array.from(TENANT_SCOPED_MODELS)) {
      expect(() =>
        assertTenantScoped(model, "findMany", { where: {} })
      ).toThrow(TenantGuardError);
      expect(() =>
        assertTenantScoped(model, "findMany", { where: { tenantId: "t1" } })
      ).not.toThrow();
    }
  });

  it(
    "blocks cross-tenant read: query with tenantId='tenant-b' fails when context has tenantId='tenant-a'",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-a", tenantSlug: "tenant-a" },
          () => {
            expect(() =>
              assertTenantScoped("User", "findMany", {
                where: { tenantId: "tenant-b" },
              })
            ).toThrow(TenantGuardError);
            resolve();
          }
        );
      });
    }
  );

  it("allows query when tenantId matches the active context", async () => {
    await new Promise<void>((resolve) => {
      tenantContext.run(
        { tenantId: "tenant-a", tenantSlug: "tenant-a" },
        () => {
          expect(() =>
            assertTenantScoped("User", "findMany", {
              where: { tenantId: "tenant-a" },
            })
          ).not.toThrow();
          resolve();
        }
      );
    });
  });
});

// ---------------------------------------------------------------------------
// withTenantGuard (integration via mock Prisma client)
// ---------------------------------------------------------------------------

describe("withTenantGuard", () => {
  function makeMockPrisma() {
    let capturedExtension: unknown = null;

    const mockClient = {
      $extends(ext: unknown) {
        capturedExtension = ext;
        // Return a proxy that invokes the extension's $allOperations handler
        return {
          async callOp(
            model: string,
            operation: string,
            args: Record<string, unknown>
          ) {
            const handler = (
              capturedExtension as {
                query: {
                  $allModels: {
                    $allOperations: (ctx: {
                      model: string;
                      operation: string;
                      args: Record<string, unknown>;
                      query: (a: unknown) => Promise<unknown>;
                    }) => Promise<unknown>;
                  };
                };
              }
            ).query.$allModels.$allOperations;

            const query = vi.fn().mockResolvedValue([
              { id: "1", tenantId: model },
            ]);
            return handler({ model, operation, args, query });
          },
        };
      },
    };

    return mockClient;
  }

  type GuardedMock = {
    callOp: (
      model: string,
      op: string,
      args: Record<string, unknown>
    ) => Promise<unknown>;
  };

  it(
    "throws TenantGuardError on cross-tenant read (missing tenantId)",
    async () => {
      const mock = makeMockPrisma();
      const guarded = withTenantGuard(mock) as unknown as GuardedMock;

      await expect(
        guarded.callOp("User", "findMany", { where: {} })
      ).rejects.toThrow(TenantGuardError);
    }
  );

  it("returns expected row when tenantId is correct", async () => {
    const mock = makeMockPrisma();
    const guarded = withTenantGuard(mock) as unknown as GuardedMock;

    const result = await guarded.callOp("User", "findMany", {
      where: { tenantId: "tenant-xyz" },
    });
    expect(result).toEqual([{ id: "1", tenantId: "User" }]);
  });

  it("returns expected row when tenantId matches active context", async () => {
    const mock = makeMockPrisma();
    const guarded = withTenantGuard(mock) as unknown as GuardedMock;

    await tenantContext.run(
      { tenantId: "tenant-xyz", tenantSlug: "tenant-xyz" },
      async () => {
        const result = await guarded.callOp("User", "findMany", {
          where: { tenantId: "tenant-xyz" },
        });
        expect(result).toEqual([{ id: "1", tenantId: "User" }]);
      }
    );
  });

  it(
    "throws TenantGuardError on cross-tenant read (mismatched tenantId)",
    async () => {
      const mock = makeMockPrisma();
      const guarded = withTenantGuard(mock) as unknown as GuardedMock;

      await tenantContext.run(
        { tenantId: "tenant-a", tenantSlug: "tenant-a" },
        async () => {
          await expect(
            guarded.callOp("User", "findMany", {
              where: { tenantId: "tenant-b" },
            })
          ).rejects.toThrow(TenantGuardError);
        }
      );
    }
  );

  it(
    "passes through Tenant model queries without tenantId requirement",
    async () => {
      const mock = makeMockPrisma();
      const guarded = withTenantGuard(mock) as unknown as GuardedMock;

      await expect(
        guarded.callOp("Tenant", "findMany", { where: {} })
      ).resolves.toBeDefined();
    }
  );
});

// ---------------------------------------------------------------------------
// extractSubdomainSlug
// ---------------------------------------------------------------------------

describe("extractSubdomainSlug", () => {
  it("extracts subdomain from a 3-part hostname", () => {
    expect(extractSubdomainSlug("acme.example.com")).toBe("acme");
  });

  it("strips port before splitting", () => {
    expect(extractSubdomainSlug("acme.example.com:3000")).toBe("acme");
  });

  it("returns null for a bare 2-part domain", () => {
    expect(extractSubdomainSlug("example.com")).toBeNull();
  });

  it("returns null for www subdomain", () => {
    expect(extractSubdomainSlug("www.example.com")).toBeNull();
  });

  it("returns null for localhost", () => {
    expect(extractSubdomainSlug("localhost")).toBeNull();
  });

  it("returns null for localhost with port", () => {
    expect(extractSubdomainSlug("localhost:3000")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveTenant
// ---------------------------------------------------------------------------

describe("resolveTenant", () => {
  it("resolves via subdomain", async () => {
    const tenant = { id: "t1", slug: "acme", name: "Acme Corp" };
    const lookup = vi.fn().mockResolvedValue(tenant);

    const result = await resolveTenant(makeReq("acme.example.com"), lookup);
    expect(result).toEqual(tenant);
    expect(lookup).toHaveBeenCalledWith("acme");
  });

  it("falls back to tenantSlug cookie when no subdomain", async () => {
    const tenant = { id: "t2", slug: "beta", name: "Beta LLC" };
    const lookup = vi.fn().mockResolvedValue(tenant);

    const result = await resolveTenant(makeReq("example.com", "beta"), lookup);
    expect(result).toEqual(tenant);
    expect(lookup).toHaveBeenCalledWith("beta");
  });

  it("resolves via session tenantSlug when provided", async () => {
    const tenant = { id: "t3", slug: "session-tenant", name: "Session Co" };
    const lookup = vi.fn().mockResolvedValue(tenant);

    const result = await resolveTenant(makeReq("example.com"), lookup, {
      tenantSlug: "session-tenant",
    });
    expect(result).toEqual(tenant);
    expect(lookup).toHaveBeenCalledWith("session-tenant");
  });

  it(
    "returns null when neither subdomain nor cookie resolves a tenant",
    async () => {
      const lookup = vi.fn().mockResolvedValue(null);

      const result = await resolveTenant(makeReq("example.com"), lookup);
      expect(result).toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// withTenantContext
// ---------------------------------------------------------------------------

describe("withTenantContext", () => {
  it("runs the handler inside the tenant context when resolved", async () => {
    const tenant = { id: "t9", slug: "acme", name: "Acme" };
    const lookup = vi.fn().mockResolvedValue(tenant);

    const result = await withTenantContext(
      makeReq("acme.example.com"),
      lookup,
      () => getTenantId()
    );

    expect(result).toBe("t9");
  });

  it("returns null when the tenant cannot be resolved", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    const handler = vi.fn().mockReturnValue("should-not-run");

    const result = await withTenantContext(
      makeReq("example.com"),
      lookup,
      handler
    );

    expect(result).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// tenantContext (AsyncLocalStorage)
// ---------------------------------------------------------------------------

describe("tenantContext", () => {
  it("getTenantContext throws outside of a run context", () => {
    expect(() => getTenantContext()).toThrow(/No tenant context/);
  });

  it("getTenantId throws outside of a run context", () => {
    expect(() => getTenantId()).toThrow(/No tenant context/);
  });

  it("getTenantSlug throws outside of a run context", () => {
    expect(() => getTenantSlug()).toThrow(/No tenant context/);
  });

  it("getTenantIdOrNull returns null outside of a run context", () => {
    expect(getTenantIdOrNull()).toBeNull();
  });

  it("getTenantSlugOrNull returns null outside of a run context", () => {
    expect(getTenantSlugOrNull()).toBeNull();
  });

  it("getTenantId returns the tenantId inside a run context", async () => {
    await new Promise<void>((resolve) => {
      tenantContext.run({ tenantId: "tenant-001", tenantSlug: "demo" }, () => {
        expect(getTenantId()).toBe("tenant-001");
        resolve();
      });
    });
  });

  it("getTenantSlug returns the tenantSlug inside a run context", async () => {
    await new Promise<void>((resolve) => {
      tenantContext.run({ tenantId: "tenant-001", tenantSlug: "demo" }, () => {
        expect(getTenantSlug()).toBe("demo");
        resolve();
      });
    });
  });

  it(
    "getTenantIdOrNull returns the tenantId inside a run context",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-002", tenantSlug: "test" },
          () => {
            expect(getTenantIdOrNull()).toBe("tenant-002");
            resolve();
          }
        );
      });
    }
  );

  it(
    "getTenantSlugOrNull returns the tenantSlug inside a run context",
    async () => {
      await new Promise<void>((resolve) => {
        tenantContext.run(
          { tenantId: "tenant-002", tenantSlug: "test" },
          () => {
            expect(getTenantSlugOrNull()).toBe("test");
            resolve();
          }
        );
      });
    }
  );
});
