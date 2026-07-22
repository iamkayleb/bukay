import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
};

type FindManyArgs = {
  where: {
    tenantId: string;
    OR?: Array<
      | { name: { contains: string; mode?: "insensitive" } }
      | { phone: { contains: string } }
    >;
  };
  take?: number;
};

const state = vi.hoisted(() => ({
  clients: [] as ClientRow[],
  findMany: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    client: { findMany: state.findMany },
    tenant: { findUnique: state.tenantFindUnique },
  },
}));

import { GET } from "@/app/api/clients/route";

function req(url: string) {
  return new NextRequest(`http://app.test${url}`, {
    headers: { "x-tenant-id": "tenant-1" },
  });
}

beforeEach(() => {
  state.clients = [
    {
      id: "c-1",
      tenantId: "tenant-1",
      name: "Ada Lovelace",
      phone: "+2348000000001",
      email: null,
    },
    {
      id: "c-2",
      tenantId: "tenant-1",
      name: "Grace Hopper",
      phone: "+2348000000099",
      email: "grace@example.com",
    },
    {
      id: "c-x",
      tenantId: "tenant-other",
      name: "Wrong",
      phone: "+2340000000000",
      email: null,
    },
  ];
  state.findMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.findMany.mockImplementation(async (args: FindManyArgs) => {
    return state.clients
      .filter((row) => {
        if (row.tenantId !== args.where.tenantId) return false;
        const or = args.where.OR;
        if (!or || or.length === 0) return true;
        return or.some((clause) => {
          if ("name" in clause) {
            return row.name.toLowerCase().includes(clause.name.contains.toLowerCase());
          }
          return row.phone.includes(clause.phone.contains);
        });
      })
      .slice(0, args.take ?? state.clients.length);
  });
});

describe("GET /api/clients", () => {
  it("returns clients scoped to the request tenant when q is empty", async () => {
    const res = await GET(req("/api/clients"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(2);
    expect(body.clients.map((c: { id: string }) => c.id).sort()).toEqual(["c-1", "c-2"]);
  });

  it("filters by name substring, case-insensitive", async () => {
    const res = await GET(req("/api/clients?q=ada"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].id).toBe("c-1");
  });

  it("filters by phone substring", async () => {
    const res = await GET(req("/api/clients?q=99"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].id).toBe("c-2");
  });

  it("returns 400 when the tenant cannot be resolved", async () => {
    const bareReq = new NextRequest("http://app.test/api/clients", {});
    const res = await GET(bareReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenant_required");
  });
});
