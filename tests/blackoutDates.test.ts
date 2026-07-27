import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOpenWindows } from "@/app/lib/availability/open-windows";

type BlackoutRow = {
  id: string;
  tenantId: string;
  date: string;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

class UniqueError extends Error {
  code = "P2002";
}

class MissingError extends Error {
  code = "P2025";
}

const state = vi.hoisted(() => ({
  blackouts: [] as Array<{
    id: string;
    tenantId: string;
    date: string;
    reason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  nextId: 1,
}));

vi.mock("@/app/db/prisma", () => {
  const blackout = {
    async findMany(args: { where: Record<string, unknown>; orderBy?: unknown; select?: unknown }) {
      void args.orderBy;
      void args.select;
      const rows = state.blackouts.filter((row) => {
        const w = args.where;
        if (w.tenantId && row.tenantId !== w.tenantId) return false;
        if (w.date) {
          if (typeof w.date === "string") {
            if (row.date !== w.date) return false;
          } else {
            const d = w.date as { gte?: string; lte?: string };
            if (d.gte && row.date < d.gte) return false;
            if (d.lte && row.date > d.lte) return false;
          }
        }
        return true;
      });
      return rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    },
    async create(args: {
      data: { tenantId: string; date: string; reason: string | null };
      select?: unknown;
    }) {
      void args.select;
      if (
        state.blackouts.some((r) => r.tenantId === args.data.tenantId && r.date === args.data.date)
      ) {
        throw new UniqueError("duplicate");
      }
      const row = {
        id: `bk${state.nextId++}`,
        tenantId: args.data.tenantId,
        date: args.data.date,
        reason: args.data.reason,
        createdAt: new Date("2026-07-10T00:00:00Z"),
        updatedAt: new Date("2026-07-10T00:00:00Z"),
      };
      state.blackouts.push(row);
      return row;
    },
    async delete(args: { where: { tenantId_date: { tenantId: string; date: string } } }) {
      const idx = state.blackouts.findIndex(
        (r) =>
          r.tenantId === args.where.tenantId_date.tenantId &&
          r.date === args.where.tenantId_date.date
      );
      if (idx < 0) {
        throw new MissingError("missing");
      }
      const [removed] = state.blackouts.splice(idx, 1);
      return removed;
    },
  };

  return {
    prisma: {
      blackout,
      tenant: {
        async findUnique(args: { where: { slug?: string; id?: string }; select?: unknown }) {
          if (args.where.id === "tenantA") return { timezone: "Africa/Lagos" };
          if (args.where.slug === "demo") return { id: "tenantA" };
          return null;
        },
      },
      businessHour: {
        async findMany(args: { where: { tenantId: string; dayOfWeek: number } }) {
          void args;
          return [{ dayOfWeek: args.where.dayOfWeek, opensAt: "09:00", closesAt: "17:00" }];
        },
      },
    },
  };
});

// Import AFTER the mock.
import { DELETE, GET, POST } from "@/app/api/blackout/route";

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
  state.blackouts.length = 0;
  state.nextId = 1;
});

describe("POST /api/blackout", () => {
  it("stores dates in YYYY-MM-DD format even when the client sends an ISO timestamp", async () => {
    const response = await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-12-25T05:00:00Z", reason: "Christmas" }),
      })
    );
    expect(response.status).toBe(201);
    const body = await json(response);
    const blackout = body.blackout as { date: string; reason: string };
    expect(blackout.date).toBe("2026-12-25");
    expect(blackout.reason).toBe("Christmas");
    expect(state.blackouts[0]?.date).toBe("2026-12-25");
  });

  it("rejects malformed date input", async () => {
    const response = await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "12/25/2026" }),
      })
    );
    expect(response.status).toBe(422);
    const body = await json(response);
    expect(body.error).toBe("validation_failed");
    expect(state.blackouts).toHaveLength(0);
  });

  it("returns 409 on duplicate (tenant, date)", async () => {
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-12-25" }),
      })
    );
    const conflict = await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-12-25" }),
      })
    );
    expect(conflict.status).toBe(409);
    const body = await json(conflict);
    expect(body.error).toBe("blackout_date_conflict");
  });
});

describe("GET /api/blackout", () => {
  it("lists blackouts for the current tenant", async () => {
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-12-25" }),
      })
    );
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-01-01" }),
      })
    );

    const body = await json(await GET(request("http://localhost/api/blackout")));
    const blackouts = body.blackouts as Array<{ date: string }>;
    expect(blackouts.map((b) => b.date)).toEqual(["2026-01-01", "2026-12-25"]);
  });

  it("filters by ?from/?to range", async () => {
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-01-01" }),
      })
    );
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-06-01" }),
      })
    );
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-12-31" }),
      })
    );

    const body = await json(
      await GET(request("http://localhost/api/blackout?from=2026-05-01&to=2026-11-30"))
    );
    const blackouts = body.blackouts as Array<{ date: string }>;
    expect(blackouts.map((b) => b.date)).toEqual(["2026-06-01"]);
  });
});

describe("DELETE /api/blackout", () => {
  it("removes an existing blackout", async () => {
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-12-25" }),
      })
    );
    const response = await DELETE(
      request("http://localhost/api/blackout", {
        method: "DELETE",
        body: JSON.stringify({ date: "2026-12-25" }),
      })
    );
    expect(response.status).toBe(200);
    expect(state.blackouts).toHaveLength(0);
  });

  it("returns 404 when no matching blackout exists", async () => {
    const response = await DELETE(
      request("http://localhost/api/blackout", {
        method: "DELETE",
        body: JSON.stringify({ date: "2026-12-25" }),
      })
    );
    expect(response.status).toBe(404);
    const body = await json(response);
    expect(body.error).toBe("blackout_not_found");
  });
});

describe("getOpenWindows honors blackouts", () => {
  it("returns [] on a blackout day even when the weekly schedule has hours", async () => {
    await POST(
      request("http://localhost/api/blackout", {
        method: "POST",
        body: JSON.stringify({ date: "2026-07-10" }),
      })
    );

    // 2026-07-10 is a Friday in Africa/Lagos.
    const windows = await getOpenWindows("tenantA", new Date("2026-07-10T12:00:00Z"));
    expect(windows).toEqual([]);
  });

  it("returns non-empty windows on a non-blackout day", async () => {
    const windows = await getOpenWindows("tenantA", new Date("2026-07-10T12:00:00Z"));
    expect(windows.length).toBe(1);
    expect(windows[0].opensAt).toBeInstanceOf(Date);
  });
});
