import { describe, it, expect, beforeEach } from "vitest";
import {
  TenantScopeError,
  assertTenantScope,
  withTenantGuard,
  tenantGuardExtension,
} from "@/app/lib/tenant-guard";
import { runWithTenant } from "@/app/lib/tenant-context";

type Row = { id: string; tenantId: string; name: string };

function makeStubClient(rows: Row[]) {
  return {
    client: rows,
    booking: {
      async findMany(args: { where?: Record<string, unknown> }) {
        const w = args?.where ?? {};
        return rows.filter((r) =>
          Object.entries(w).every(([k, v]) => (r as Record<string, unknown>)[k] === v)
        );
      },
      async findUnique(args: { where: { id?: string; tenantId?: string } }) {
        return (
          rows.find(
            (r) =>
              (!args.where.id || r.id === args.where.id) &&
              (!args.where.tenantId || r.tenantId === args.where.tenantId)
          ) ?? null
        );
      },
      async create(args: { data: Row }) {
        rows.push(args.data);
        return args.data;
      },
    },
  };
}

const SEED: Row[] = [
  { id: "b1", tenantId: "t-acme", name: "Acme booking" },
  { id: "b2", tenantId: "t-globex", name: "Globex booking" },
];

describe("assertTenantScope", () => {
  it("throws when a scoped read omits tenantId", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "findMany",
        args: { where: { id: "b1" } },
        tenantId: "t-acme",
      })
    ).toThrow(TenantScopeError);
  });

  it("throws on cross-tenant read", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "findMany",
        args: { where: { tenantId: "t-globex" } },
        tenantId: "t-acme",
      })
    ).toThrow(/tenantId/);
  });

  it("passes when where.tenantId matches context", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "findMany",
        args: { where: { tenantId: "t-acme" } },
        tenantId: "t-acme",
      })
    ).not.toThrow();
  });

  it("passes for non-scoped models without tenantId", () => {
    expect(() =>
      assertTenantScope({
        model: "Tenant",
        operation: "findUnique",
        args: { where: { id: "anything" } },
        tenantId: undefined,
      })
    ).not.toThrow();
  });

  it("requires tenantId on create payloads", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "create",
        args: { data: { name: "no tenant" } },
        tenantId: "t-acme",
      })
    ).toThrow(TenantScopeError);
  });

  it("rejects mismatched tenantId on create", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "create",
        args: { data: { tenantId: "t-globex", name: "x" } },
        tenantId: "t-acme",
      })
    ).toThrow(TenantScopeError);
  });
});

describe("withTenantGuard (proxy wrapper)", () => {
  let stub: ReturnType<typeof makeStubClient>;
  beforeEach(() => {
    stub = makeStubClient([...SEED]);
  });

  it("returns expected row for the correct tenant", async () => {
    const client = withTenantGuard(stub, { getTenantId: () => "t-acme" });
    const result = await runWithTenant({ tenantId: "t-acme" }, () =>
      client.booking.findMany({ where: { tenantId: "t-acme" } })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
  });

  it("throws on cross-tenant query in the wrapped client", async () => {
    const client = withTenantGuard(stub, { getTenantId: () => "t-acme" });
    await expect(
      client.booking.findMany({ where: { tenantId: "t-globex" } })
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("throws when tenantId is missing from the where clause", async () => {
    const client = withTenantGuard(stub, { getTenantId: () => "t-acme" });
    await expect(client.booking.findMany({ where: { id: "b1" } })).rejects.toThrow(/tenantId/);
  });

  it("reads tenantId from AsyncLocalStorage when no override is configured", async () => {
    const client = withTenantGuard(stub);
    await expect(
      runWithTenant({ tenantId: "t-acme" }, () =>
        client.booking.findMany({ where: { tenantId: "t-globex" } })
      )
    ).rejects.toBeInstanceOf(TenantScopeError);

    const ok = await runWithTenant({ tenantId: "t-acme" }, () =>
      client.booking.findMany({ where: { tenantId: "t-acme" } })
    );
    expect(ok.map((r) => r.id)).toEqual(["b1"]);
  });
});

describe("tenantGuardExtension shape", () => {
  it("hooks lowercase delegate properties, not capitalized model names", () => {
    const ext = tenantGuardExtension({ models: ["Booking", "Client"] });
    expect(ext.name).toBe("tenant-guard");
    expect(Object.keys(ext.query).sort()).toEqual(["booking", "client"]);
    expect(typeof ext.query.booking.$allOperations).toBe("function");
    expect(ext.query.Booking).toBeUndefined();
  });
});

describe("nested tenantId detection", () => {
  it("accepts tenantId nested inside AND", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "findMany",
        args: { where: { AND: [{ tenantId: "t-acme" }, { status: "confirmed" }] } },
        tenantId: "t-acme",
      })
    ).not.toThrow();
  });

  it("rejects OR clause with a branch that lacks tenantId (bypass attempt)", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "findMany",
        args: { where: { OR: [{ tenantId: "t-acme" }, { status: "confirmed" }] } },
        tenantId: "t-acme",
      })
    ).toThrow(TenantScopeError);
  });

  it("rejects OR clause with mismatched tenantIds across branches", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "findMany",
        args: { where: { OR: [{ tenantId: "t-acme" }, { tenantId: "t-globex" }] } },
        tenantId: "t-acme",
      })
    ).toThrow(TenantScopeError);
  });

  it("accepts OR clause when every branch pins the same tenantId", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "findMany",
        args: {
          where: {
            OR: [
              { tenantId: "t-acme", status: "confirmed" },
              { tenantId: "t-acme", status: "pending" },
            ],
          },
        },
        tenantId: "t-acme",
      })
    ).not.toThrow();
  });
});

describe("upsert data validation", () => {
  it("rejects upsert when create payload lacks tenantId", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "upsert",
        args: {
          where: { tenantId: "t-acme", id: "b1" },
          create: { name: "new" },
          update: { tenantId: "t-acme", name: "renamed" },
        },
        tenantId: "t-acme",
      })
    ).toThrow(TenantScopeError);
  });

  it("rejects upsert when update payload carries a foreign tenantId", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "upsert",
        args: {
          where: { tenantId: "t-acme", id: "b1" },
          create: { tenantId: "t-acme", name: "new" },
          update: { tenantId: "t-globex", name: "renamed" },
        },
        tenantId: "t-acme",
      })
    ).toThrow(TenantScopeError);
  });

  it("accepts upsert when create carries tenantId and update omits it", () => {
    expect(() =>
      assertTenantScope({
        model: "Booking",
        operation: "upsert",
        args: {
          where: { tenantId: "t-acme", id: "b1" },
          create: { tenantId: "t-acme", name: "new" },
          update: { name: "renamed" },
        },
        tenantId: "t-acme",
      })
    ).not.toThrow();
  });
});
