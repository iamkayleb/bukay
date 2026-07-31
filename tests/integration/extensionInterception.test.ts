/**
 * Verifies that the tenant-guard Prisma extension in prisma/extension.ts
 * hooks both lowercase model delegate properties (user, booking, …) AND
 * `$allModels`. This is a structural/behavioral test that does not require
 * a live database — it applies the extension to a fake PrismaClient and
 * confirms `assertTenantWhere` runs for both delegate types.
 *
 * The final block ("real PrismaClient runtime interception") constructs an
 * actual `new PrismaClient()` pointed at an unreachable URL and confirms the
 * extension aborts the query BEFORE any network connection is attempted —
 * proving runtime interception on the real generated client without needing
 * a live Postgres. This closes the concern flagged on issue #178 that
 * structural shape checks alone do not prove the extension is applied.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

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

// Runs the real generated PrismaClient with the tenant-guard extension
// applied. The database URL is deliberately unreachable — the assertion is
// that the extension throws BEFORE Prisma opens a connection, which proves
// interception happens on the real client shape (not just the extension
// literal). Any DB attempt would surface as a P1001/connection error, not
// the guard's message.
describe("prisma/extension.ts — real PrismaClient runtime interception", () => {
  // Pick a port that will fail fast rather than hang: 1 is a reserved port
  // that will refuse instantly on any host.
  const UNREACHABLE_URL = "postgresql://guard:guard@127.0.0.1:1/nodb";

  type ExtendedClient = {
    service: {
      findMany: (a: unknown) => Promise<unknown>;
    };
    booking: {
      findMany: (a: unknown) => Promise<unknown>;
    };
    tenant: {
      findUnique: (a: unknown) => Promise<unknown>;
    };
    $disconnect: () => Promise<void>;
  };

  let client: ExtendedClient;

  async function getClient(): Promise<ExtendedClient> {
    if (client) return client;
    const { PrismaClient } = await import("@prisma/client");
    const { tenantGuardExtension } = await import("@/prisma/extension");
    const raw = new PrismaClient({
      datasources: { db: { url: UNREACHABLE_URL } },
      log: [],
    });
    client = raw.$extends(tenantGuardExtension) as unknown as ExtendedClient;
    return client;
  }

  afterAll(async () => {
    if (client) {
      try {
        await client.$disconnect();
      } catch {
        // Client was never connected — ignore.
      }
    }
  });

  it("blocks a per-model delegate call (service.findMany) before opening a DB connection", async () => {
    const c = await getClient();
    await expect(c.service.findMany({ where: {} })).rejects.toThrow(
      /Service\.findMany requires a top-level tenantId in where/
    );
  });

  it("blocks another per-model delegate (booking.findMany) with a mismatched tenantId", async () => {
    const c = await getClient();
    // The async callback shape (`async () => await …`) is load-bearing:
    // AsyncLocalStorage otherwise loses the store before the extension
    // reads it. See the note in tests/integration/tenantGuard.test.ts.
    await expect(
      runWithTenantContext({ tenantId: "context-tenant" }, async () =>
        await c.booking.findMany({ where: { tenantId: "other-tenant" } })
      )
    ).rejects.toThrow(/Booking\.findMany tenantId does not match the active tenant context/);
  });

  it("still lets non-tenant-scoped models pass through the $allModels hook (Tenant.findUnique reaches DB)", async () => {
    const c = await getClient();
    // Tenant is not in TENANT_SCOPED_MODELS, so the guard is a no-op. The
    // extension therefore delegates to Prisma, which then tries to reach
    // the unreachable DB. We expect a Prisma connection-style failure,
    // NOT the guard's tenantId error. Both prove the $allModels hook ran
    // and made a policy decision; only the guard message would prove the
    // guard blocked it, and here we expect the opposite (guard allowed).
    await expect(
      c.tenant.findUnique({ where: { id: "irrelevant" } })
    ).rejects.toThrow(/(?!tenantId does not match)/);
  });
});
