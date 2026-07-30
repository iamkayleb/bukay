/**
 * Verifies that the tenant-guard Prisma extension in prisma/extension.ts
 * hooks both lowercase model delegate properties (user, booking, …) AND
 * `$allModels`. This is a structural/behavioral test that does not require
 * a live database — it applies the extension to a fake PrismaClient and
 * confirms `assertTenantWhere` runs for both delegate types.
 */

import { describe, expect, it, vi } from "vitest";

import { runWithTenantContext } from "@/app/tenancy/tenant-context";

const assertSpy = vi.hoisted(() => vi.fn());

vi.mock("@/app/db/tenant-guard", async () => {
  const actual = await vi.importActual<typeof import("@/app/db/tenant-guard")>(
    "@/app/db/tenant-guard"
  );
  return {
    ...actual,
    assertTenantWhere: (...args: Parameters<typeof actual.assertTenantWhere>) => {
      assertSpy(...args);
      return actual.assertTenantWhere(...args);
    },
  };
});

import { tenantGuardExtension } from "@/prisma/extension";

type ExtensionShape = {
  query: {
    $allModels?: { $allOperations?: (...args: unknown[]) => unknown };
    [delegate: string]:
      | { $allOperations?: (...args: unknown[]) => unknown }
      | undefined;
  };
};

function getExtensionShape(): ExtensionShape {
  const raw = tenantGuardExtension as unknown as {
    (client: unknown): unknown;
    query?: ExtensionShape["query"];
  };
  if (raw.query) {
    return { query: raw.query };
  }
  // Prisma.defineExtension returns a builder callable — invoke with a stub
  // client to surface the underlying definition.
  const stubClient = { $extends: (arg: unknown) => arg };
  const result = raw(stubClient) as ExtensionShape | undefined;
  if (result?.query) return result;
  throw new Error(
    "Could not introspect tenant-guard extension shape; adjust the test if Prisma internals changed."
  );
}

describe("prisma/extension.ts — tenant-guard extension", () => {
  it("declares per-model hooks for every tenant-scoped lowercase delegate", () => {
    const { query } = getExtensionShape();
    const expected = [
      "auditLog",
      "booking",
      "businessHour",
      "client",
      "payment",
      "service",
      "staff",
      "user",
    ];
    for (const delegate of expected) {
      expect(query[delegate], `missing per-model hook for ${delegate}`).toBeDefined();
      expect(
        query[delegate]?.$allOperations,
        `missing $allOperations under ${delegate}`
      ).toBeTypeOf("function");
    }
  });

  it("also declares a $allModels fallback hook", () => {
    const { query } = getExtensionShape();
    expect(query.$allModels).toBeDefined();
    expect(query.$allModels?.$allOperations).toBeTypeOf("function");
  });

  it("intercepts a per-model query via the lowercase delegate hook", async () => {
    assertSpy.mockClear();
    const { query } = getExtensionShape();
    const userHook = query.user?.$allOperations;
    expect(userHook).toBeTypeOf("function");

    const runQuery = vi.fn().mockResolvedValue("ok");
    await runWithTenantContext({ tenantId: "t1" }, () =>
      (userHook as (arg: unknown) => Promise<unknown>)({
        operation: "findMany",
        args: { where: { tenantId: "t1" } },
        query: runQuery,
      })
    );

    expect(assertSpy).toHaveBeenCalledWith(
      "User",
      "findMany",
      { where: { tenantId: "t1" } }
    );
    expect(runQuery).toHaveBeenCalledOnce();
  });

  it("intercepts via the $allModels hook for models not in the per-model list", async () => {
    assertSpy.mockClear();
    const { query } = getExtensionShape();
    const allModelsHook = query.$allModels?.$allOperations;
    expect(allModelsHook).toBeTypeOf("function");

    const runQuery = vi.fn().mockResolvedValue("ok");
    await (allModelsHook as (arg: unknown) => Promise<unknown>)({
      model: "Tenant",
      operation: "findUnique",
      args: { where: { id: "t1" } },
      query: runQuery,
    });

    // Tenant is not a tenant-scoped model, so assert should still be called
    // but return without throwing.
    expect(assertSpy).toHaveBeenCalledWith(
      "Tenant",
      "findUnique",
      { where: { id: "t1" } }
    );
    expect(runQuery).toHaveBeenCalledOnce();
  });

  it("throws when the per-model hook runs a tenant-scoped query without a tenantId", () => {
    const { query } = getExtensionShape();
    const bookingHook = query.booking?.$allOperations as (arg: unknown) => unknown;

    expect(() =>
      bookingHook({
        operation: "findMany",
        args: { where: { status: "confirmed" } },
        query: vi.fn(),
      })
    ).toThrow(/tenantId/);
  });

  it("throws when the per-model hook's tenantId disagrees with the active context", () => {
    const { query } = getExtensionShape();
    const serviceHook = query.service?.$allOperations as (arg: unknown) => unknown;

    expect(() =>
      runWithTenantContext({ tenantId: "t1" }, () =>
        serviceHook({
          operation: "findMany",
          args: { where: { tenantId: "t2" } },
          query: vi.fn(),
        })
      )
    ).toThrow(/tenantId does not match/);
  });
});
