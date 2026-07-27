import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type BusinessHourRow = {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  hours: [] as BusinessHourRow[],
  nextId: 1,
}));

vi.mock("@/app/db/prisma", () => {
  const businessHour = {
    async findMany(args: { where: Record<string, unknown>; orderBy?: unknown; select?: unknown }) {
      void args.orderBy;
      void args.select;
      const rows = state.hours.filter((row) => {
        const w = args.where;
        if (w.tenantId && row.tenantId !== w.tenantId) return false;
        if (w.isClosed !== undefined && row.isClosed !== w.isClosed) return false;
        return true;
      });
      return rows
        .slice()
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt));
    },
    async deleteMany(args: { where: { tenantId: string } }) {
      const before = state.hours.length;
      state.hours = state.hours.filter((r) => r.tenantId !== args.where.tenantId);
      return { count: before - state.hours.length };
    },
    async createMany(args: {
      data: Array<Omit<BusinessHourRow, "id" | "createdAt" | "updatedAt">>;
    }) {
      for (const row of args.data) {
        state.hours.push({
          id: `bh${state.nextId++}`,
          createdAt: new Date("2026-07-10T00:00:00Z"),
          updatedAt: new Date("2026-07-10T00:00:00Z"),
          ...row,
        });
      }
      return { count: args.data.length };
    },
  };

  return {
    prisma: {
      businessHour,
      tenant: {
        async findUnique(args: { where: { slug?: string }; select?: unknown }) {
          void args.select;
          if (args.where.slug === "demo") return { id: "tenantA" };
          return null;
        },
      },
      async $transaction<T>(ops: Array<Promise<T>>): Promise<T[]> {
        return Promise.all(ops);
      },
    },
  };
});

// Import AFTER the mock is registered.
import { GET, PUT } from "@/app/api/schedule/route";

function request(url: string, init: NextRequestInit = {}): NextRequest {
  return new NextRequest(new URL(url, "http://localhost").toString(), {
    ...init,
    headers: {
      "x-tenant-id": "tenantA",
      ...(init.headers ?? {}),
    },
  });
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  state.hours = [];
  state.nextId = 1;
});

describe("PUT /api/schedule + GET /api/schedule (owner workflow)", () => {
  it("persists multiple open windows per weekday", async () => {
    const put = await PUT(
      request("http://localhost/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          days: {
            "1": [
              { opensAt: "09:00", closesAt: "12:00" },
              { opensAt: "14:00", closesAt: "18:00" },
            ],
            "2": [{ opensAt: "10:00", closesAt: "17:00" }],
          },
        }),
      })
    );
    expect(put.status).toBe(200);

    const get = await GET(request("http://localhost/api/schedule"));
    const body = await json(get);
    expect(body.ok).toBe(true);
    const days = body.days as Record<string, Array<{ opensAt: string; closesAt: string }>>;
    expect(days["1"]).toEqual([
      { opensAt: "09:00", closesAt: "12:00" },
      { opensAt: "14:00", closesAt: "18:00" },
    ]);
    expect(days["2"]).toEqual([{ opensAt: "10:00", closesAt: "17:00" }]);
    expect(days["0"]).toEqual([]);
    expect(days["6"]).toEqual([]);
  });

  it("replaces the full schedule on subsequent PUTs", async () => {
    await PUT(
      request("http://localhost/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          days: {
            "1": [{ opensAt: "09:00", closesAt: "17:00" }],
            "2": [{ opensAt: "09:00", closesAt: "17:00" }],
          },
        }),
      })
    );

    await PUT(
      request("http://localhost/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          days: {
            "3": [{ opensAt: "08:00", closesAt: "12:00" }],
          },
        }),
      })
    );

    const body = await json(await GET(request("http://localhost/api/schedule")));
    const days = body.days as Record<string, Array<unknown>>;
    expect(days["1"]).toEqual([]);
    expect(days["2"]).toEqual([]);
    expect(days["3"]).toEqual([{ opensAt: "08:00", closesAt: "12:00" }]);
  });

  it("rejects windows where closesAt is not after opensAt", async () => {
    const response = await PUT(
      request("http://localhost/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          days: { "1": [{ opensAt: "18:00", closesAt: "09:00" }] },
        }),
      })
    );
    expect(response.status).toBe(422);
    const body = await json(response);
    expect(body.error).toBe("validation_failed");
  });

  it("rejects malformed weekday keys", async () => {
    const response = await PUT(
      request("http://localhost/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          days: { "9": [{ opensAt: "09:00", closesAt: "17:00" }] },
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  it("requires a tenant header", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/schedule", {
        method: "PUT",
        body: JSON.stringify({ days: {} }),
      })
    );
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.error).toBe("tenant_required");
  });
});
