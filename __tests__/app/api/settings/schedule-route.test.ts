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
  transaction: vi.fn(),
  tenantFindUnique: vi.fn(),
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

import { GET, PUT } from "@/app/api/settings/schedule/route";

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    headers: {
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(path: string, body: unknown, init: NextRequestInit = {}) {
  return request(path, {
    ...init,
    method: init.method ?? "PUT",
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.businessHours = [
    { id: "hour-1", tenantId: "tenant-1", dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
    { id: "hour-2", tenantId: "tenant-2", dayOfWeek: 1, opensAt: "08:00", closesAt: "16:00" },
  ];
  state.blackouts = [
    { id: "blackout-1", tenantId: "tenant-1", date: "2026-12-25", reason: "Holiday" },
  ];

  state.businessHourFindMany.mockReset();
  state.businessHourDeleteMany.mockReset();
  state.businessHourCreateMany.mockReset();
  state.blackoutFindMany.mockReset();
  state.blackoutDeleteMany.mockReset();
  state.blackoutCreateMany.mockReset();
  state.transaction.mockReset();
  state.tenantFindUnique.mockReset();

  state.businessHourFindMany.mockImplementation(async (args: { where: { tenantId: string } }) =>
    state.businessHours.filter((hour) => hour.tenantId === args.where.tenantId)
  );
  state.blackoutFindMany.mockImplementation(async (args: { where: { tenantId: string } }) =>
    state.blackouts.filter((blackout) => blackout.tenantId === args.where.tenantId)
  );
  state.businessHourDeleteMany.mockResolvedValue({ count: 1 });
  state.blackoutDeleteMany.mockResolvedValue({ count: 1 });
  state.businessHourCreateMany.mockResolvedValue({ count: 0 });
  state.blackoutCreateMany.mockResolvedValue({ count: 0 });
  state.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
    Promise.all(operations)
  );
});

describe("/api/settings/schedule", () => {
  it("lists tenant business hours and blackouts", async () => {
    const res = await GET(request("/api/settings/schedule"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.businessHours).toEqual([
      {
        id: "hour-1",
        tenantId: "tenant-1",
        dayOfWeek: 1,
        opensAt: "09:00",
        closesAt: "12:00",
      },
    ]);
    expect(body.blackouts).toEqual([
      {
        id: "blackout-1",
        tenantId: "tenant-1",
        date: "2026-12-25",
        reason: "Holiday",
      },
    ]);
  });

  it("replaces the tenant schedule with weekly windows and blackouts", async () => {
    const res = await PUT(
      jsonRequest("/api/settings/schedule", {
        businessHours: [
          { dayOfWeek: 2, opensAt: "10:00", closesAt: "16:00" },
          { dayOfWeek: 1, opensAt: "14:00", closesAt: "18:00" },
          { dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
        ],
        blackouts: [{ date: "2026-12-25", reason: " Christmas " }],
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.businessHourDeleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(state.blackoutDeleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(state.businessHourCreateMany).toHaveBeenCalledWith({
      data: [
        { tenantId: "tenant-1", dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
        { tenantId: "tenant-1", dayOfWeek: 1, opensAt: "14:00", closesAt: "18:00" },
        { tenantId: "tenant-1", dayOfWeek: 2, opensAt: "10:00", closesAt: "16:00" },
      ],
    });
    expect(state.blackoutCreateMany).toHaveBeenCalledWith({
      data: [{ tenantId: "tenant-1", date: "2026-12-25", reason: "Christmas" }],
    });
  });

  it("rejects invalid windows before writing", async () => {
    const res = await PUT(
      jsonRequest("/api/settings/schedule", {
        businessHours: [{ dayOfWeek: 1, opensAt: "18:00", closesAt: "09:00" }],
        blackouts: [],
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(state.businessHourDeleteMany).not.toHaveBeenCalled();
  });
});
