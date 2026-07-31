/**
 * Integration-style tests that exercise the Prisma client extension shape.
 *
 * We simulate the Prisma extension surface (PrismaClient.$extends) closely
 * enough to prove the guard intercepts model delegate calls under the
 * lowercase names Prisma actually resolves ("user", "booking", "$allModels").
 *
 * Raw SQL entry points ($queryRaw / $executeRaw) sit OUTSIDE the model
 * delegate map, so this test also demonstrates the documented bypass warning.
 */
import { describe, expect, it, vi } from "vitest";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

vi.mock("@prisma/client", () => ({
  Prisma: {
    defineExtension: vi.fn((extension) => extension),
  },
}));

// Import AFTER the mock so `defineExtension` returns the raw extension object.
import { tenantGuardExtension as dbTenantGuardExtension } from "@/app/db/tenant-guard";
import { tenantGuardExtension as libTenantGuardExtension } from "@/app/lib/tenant-guard";

type Row = { id: string; tenantId: string; name?: string; status?: string };

/**
 * Build a stub whose surface mirrors a PrismaClient extended with the
 * tenant-guard extension. Model delegates return promises the same way
 * PrismaClient does; the extension's $allOperations wraps each call.
 */
function buildExtendedClient(rows: Row[]) {
  const booking = {
    async findMany(args: { where: Record<string, unknown> }) {
      const where = args.where ?? {};
      const tid = (where as Record<string, unknown>).tenantId;
      return rows.filter((r) => (tid ? r.tenantId === tid : true));
    },
    async create(args: { data: Row }) {
      rows.push(args.data);
      return args.data;
    },
    async upsert(args: {
      where: { id: string; tenantId?: string };
      create: Row;
      update: Partial<Row>;
    }) {
      const existing = rows.find((r) => r.id === args.where.id);
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }
      rows.push(args.create);
      return args.create;
    },
  };

  const rawClient = {
    booking,
    $queryRaw: async (_query: TemplateStringsArray, ..._params: unknown[]) => rows,
    $executeRaw: async (_query: TemplateStringsArray, ..._params: unknown[]) => rows.length,
  } as Record<string, unknown>;

  // Route every delegate call through the extension's $allOperations hook. The
  // hook is responsible for the guard check AND for invoking the underlying
  // query — this mirrors how PrismaClient.$extends actually calls extensions.
  const wrapDelegate = (
    delegate: Record<string, (args: unknown) => Promise<unknown>>,
    invoke: (op: string, args: unknown, run: (a: unknown) => Promise<unknown>) => Promise<unknown>
  ) =>
    new Proxy(delegate, {
      get(target, prop, receiver) {
        const fn = Reflect.get(target, prop, receiver);
        if (typeof prop !== "string" || typeof fn !== "function") return fn;
        return async (args: unknown) => {
          const run = (a: unknown) => (fn as (x: unknown) => Promise<unknown>).call(target, a);
          return invoke(prop, args, run);
        };
      },
    });

  // db/tenant-guard uses $allModels — we invoke assertTenantWhere for any
  // model delegate call.
  const dbGuard = (dbTenantGuardExtension as any).query.$allModels.$allOperations as (
    p: unknown
  ) => Promise<unknown>;

  // lib/tenant-guard hooks lowercase per-delegate — verify it lands on
  // ext.query.booking specifically.
  const libExt = libTenantGuardExtension({
    getTenantId: () => "",
    models: ["Booking"],
  });
  const libBookingHook = (libExt.query as Record<string, any>).booking?.$allOperations as (
    p: unknown
  ) => Promise<unknown>;

  const bookingDelegate = booking as unknown as Record<string, (a: unknown) => Promise<unknown>>;

  return {
    withDbGuard: (): Record<string, unknown> => ({
      ...rawClient,
      booking: wrapDelegate(bookingDelegate, (op, args, run) =>
        dbGuard({ model: "Booking", operation: op, args, query: run })
      ),
    }),
    withLibGuard: (): Record<string, unknown> => {
      if (!libBookingHook) {
        throw new Error("expected lib extension to hook `booking`");
      }
      return {
        ...rawClient,
        booking: wrapDelegate(bookingDelegate, (op, args, run) =>
          libBookingHook({ operation: op, args, query: run })
        ),
      };
    },
  };
}

const SEED: Row[] = [
  { id: "b1", tenantId: "t-acme", status: "confirmed", name: "Acme booking" },
  { id: "b2", tenantId: "t-globex", status: "confirmed", name: "Globex booking" },
];

describe("PrismaClient extension: current-tenant queries return data", () => {
  it("returns bookings for the active tenant", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    const rows = await runWithTenantContext({ tenantId: "t-acme" }, () =>
      (client.booking as any).findMany({ where: { tenantId: "t-acme" } })
    );
    expect(rows.map((r: Row) => r.id)).toEqual(["b1"]);
  });
});

describe("PrismaClient extension: cross-tenant queries are blocked", () => {
  it("throws when the query targets a different tenant than the context", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    await expect(
      runWithTenantContext({ tenantId: "t-acme" }, () =>
        (client.booking as any).findMany({ where: { tenantId: "t-globex" } })
      )
    ).rejects.toThrow(/does not match the active tenant context/);
  });

  it("throws when the query omits tenantId entirely", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    await expect(
      (client.booking as any).findMany({ where: { status: "confirmed" } })
    ).rejects.toThrow(/requires a tenantId in where/);
  });
});

describe("PrismaClient extension: nested AND/OR bypass attempts", () => {
  it("accepts tenantId nested inside AND", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    const rows = await runWithTenantContext({ tenantId: "t-acme" }, () =>
      (client.booking as any).findMany({
        where: { AND: [{ tenantId: "t-acme" }, { status: "confirmed" }] },
      })
    );
    // Guard passes; the stub's own filter uses top-level tenantId so it
    // returns every row — the important thing here is that the guard didn't
    // throw. The guard is a safety net, not a query rewriter.
    expect(Array.isArray(rows)).toBe(true);
  });

  it("blocks OR clauses that leak cross-tenant rows", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    await expect(
      runWithTenantContext({ tenantId: "t-acme" }, () =>
        (client.booking as any).findMany({
          where: { OR: [{ tenantId: "t-acme" }, { status: "confirmed" }] },
        })
      )
    ).rejects.toThrow(/requires a tenantId in where/);
  });

  it("blocks OR clauses whose branches disagree on tenantId", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    await expect(
      runWithTenantContext({ tenantId: "t-acme" }, () =>
        (client.booking as any).findMany({
          where: { OR: [{ tenantId: "t-acme" }, { tenantId: "t-globex" }] },
        })
      )
    ).rejects.toThrow(/requires a tenantId in where/);
  });
});

describe("PrismaClient extension: upsert validation", () => {
  it("rejects an upsert whose create payload lacks tenantId", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    await expect(
      runWithTenantContext({ tenantId: "t-acme" }, () =>
        (client.booking as any).upsert({
          where: { tenantId: "t-acme", id: "b1" },
          create: { id: "b3", status: "confirmed" }, // no tenantId
          update: { status: "cancelled" },
        })
      )
    ).rejects.toThrow(/create payload must include tenantId/);
  });

  it("rejects an upsert whose update payload carries a foreign tenantId", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    await expect(
      runWithTenantContext({ tenantId: "t-acme" }, () =>
        (client.booking as any).upsert({
          where: { tenantId: "t-acme", id: "b1" },
          create: { id: "b3", tenantId: "t-acme", status: "confirmed" },
          update: { tenantId: "t-globex", status: "cancelled" },
        })
      )
    ).rejects.toThrow(/update\.tenantId does not match/);
  });
});

describe("lib extension: hooks the lowercase delegate name", () => {
  it("throws for cross-tenant queries via the delegate hook", async () => {
    const client = buildExtendedClient([...SEED]).withLibGuard();
    await expect(
      (client.booking as any).findMany({ where: { status: "confirmed" } })
    ).rejects.toThrow(/tenantId/);
  });
});

describe("raw SQL DOES bypass the tenant guard (documented risk)", () => {
  it("$queryRaw returns all rows regardless of the current tenant context", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    const rows = await runWithTenantContext(
      { tenantId: "t-acme" },
      () => (client.$queryRaw as any)`SELECT * FROM Booking`
    );
    // Cross-tenant rows are visible because the extension only wraps model
    // delegates — $queryRaw / $executeRaw are NOT intercepted.
    expect(rows.map((r: Row) => r.tenantId).sort()).toEqual(["t-acme", "t-globex"]);
  });

  it("$executeRaw executes regardless of the current tenant context", async () => {
    const client = buildExtendedClient([...SEED]).withDbGuard();
    const affected = await runWithTenantContext(
      { tenantId: "t-acme" },
      () => (client.$executeRaw as any)`DELETE FROM Booking WHERE 1=1`
    );
    expect(affected).toBe(SEED.length);
  });
});
