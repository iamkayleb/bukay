import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type BusinessHourRow = {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
};

type BlackoutRow = {
  id: string;
  tenantId: string;
  date: string;
  reason: string | null;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  businessHours: [] as BusinessHourRow[],
  blackouts: [] as BlackoutRow[],
  businessHourFindMany: vi.fn(),
  businessHourDeleteMany: vi.fn(),
  businessHourCreateMany: vi.fn(),
  blackoutFindMany: vi.fn(),
  blackoutDeleteMany: vi.fn(),
  blackoutCreateMany: vi.fn(),
  tenantFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    businessHour: {
      findMany: state.businessHourFindMany,
      deleteMany: state.businessHourDeleteMany,
      createMany: state.businessHourCreateMany,
    },
    blackout: {
      findMany: state.blackoutFindMany,
      deleteMany: state.blackoutDeleteMany,
      createMany: state.blackoutCreateMany,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
    $transaction: state.transaction,
  },
}));

import { GET, PUT } from "@/app/api/settings/availability/route";

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    headers: {
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(path: string, body: unknown) {
  return request(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.businessHours = [
    { id: "hour-1", tenantId: "tenant-1", dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
    { id: "hour-2", tenantId: "tenant-1", dayOfWeek: 1, opensAt: "13:00", closesAt: "17:00" },
    { id: "hour-3", tenantId: "tenant-2", dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00" },
  ];
  state.blackouts = [
    { id: "blackout-1", tenantId: "tenant-1", date: "2026-12-25", reason: "Holiday" },
    { id: "blackout-2", tenantId: "tenant-2", date: "2026-12-25", reason: "Other" },
  ];

  state.businessHourFindMany.mockReset();
  state.businessHourDeleteMany.mockReset();
  state.businessHourCreateMany.mockReset();
  state.blackoutFindMany.mockReset();
  state.blackoutDeleteMany.mockReset();
  state.blackoutCreateMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.transaction.mockReset();

  state.businessHourFindMany.mockImplementation(async (args: { where: { tenantId: string } }) =>
    state.businessHours.filter((row) => row.tenantId === args.where.tenantId)
  );
  state.blackoutFindMany.mockImplementation(async (args: { where: { tenantId: string } }) =>
    state.blackouts.filter((row) => row.tenantId === args.where.tenantId)
  );
  state.businessHourDeleteMany.mockResolvedValue({ count: 0 });
  state.blackoutDeleteMany.mockResolvedValue({ count: 0 });
  state.businessHourCreateMany.mockImplementation(
    async (args: { data: Array<Omit<BusinessHourRow, "id">> }) => {
      state.businessHours = args.data.map((row, index) => ({ ...row, id: `new-hour-${index}` }));
      return { count: args.data.length };
    }
  );
  state.blackoutCreateMany.mockImplementation(
    async (args: { data: Array<Omit<BlackoutRow, "id">> }) => {
      state.blackouts = args.data.map((row, index) => ({
        ...row,
        id: `new-blackout-${index}`,
      }));
      return { count: args.data.length };
    }
  );
  state.transaction.mockImplementation(async (actions: Array<Promise<unknown>>) =>
    Promise.all(actions)
  );
});

describe("/api/settings/availability", () => {
  it("lists weekly hours and blackouts scoped to the request tenant", async () => {
    const response = await GET(request("/api/settings/availability"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.businessHours).toHaveLength(2);
    expect(body.blackouts).toEqual([
      {
        id: "blackout-1",
        tenantId: "tenant-1",
        date: "2026-12-25",
        reason: "Holiday",
      },
    ]);
  });

  it("replaces the tenant schedule and blackout dates", async () => {
    const response = await PUT(
      jsonRequest("/api/settings/availability", {
        businessHours: [
          { dayOfWeek: 2, opensAt: "10:00", closesAt: "12:00" },
          { dayOfWeek: 2, opensAt: "13:00", closesAt: "15:00" },
        ],
        blackouts: [{ date: "2026-12-25", reason: "Holiday" }],
      })
    );

    expect(response.status).toBe(200);
    expect(state.businessHourDeleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(state.blackoutDeleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(state.businessHourCreateMany).toHaveBeenCalledWith({
      data: [
        { tenantId: "tenant-1", dayOfWeek: 2, opensAt: "10:00", closesAt: "12:00" },
        { tenantId: "tenant-1", dayOfWeek: 2, opensAt: "13:00", closesAt: "15:00" },
      ],
    });
    expect(state.blackoutCreateMany).toHaveBeenCalledWith({
      data: [{ tenantId: "tenant-1", date: "2026-12-25", reason: "Holiday" }],
    });
  });

  it("rejects duplicate windows before replacing records", async () => {
    const response = await PUT(
      jsonRequest("/api/settings/availability", {
        businessHours: [
          { dayOfWeek: 2, opensAt: "10:00", closesAt: "12:00" },
          { dayOfWeek: 2, opensAt: "10:00", closesAt: "12:00" },
        ],
        blackouts: [],
      })
    );

    expect(response.status).toBe(409);
    expect(state.businessHourDeleteMany).not.toHaveBeenCalled();
  });
});
