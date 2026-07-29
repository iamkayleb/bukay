import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  businessHours: [] as Array<{
    tenantId: string;
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
  }>,
  blackouts: [] as Array<{ id: string; tenantId: string; date: string }>,
  businessHourFindMany: vi.fn(),
  blackoutFindFirst: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    businessHour: {
      findMany: state.businessHourFindMany,
    },
    blackout: {
      findFirst: state.blackoutFindFirst,
    },
  },
}));

import {
  dayOfWeekForLocalDate,
  getOpenWindows,
  toTenantLocalDate,
} from "@/app/lib/availability/open-windows";

beforeEach(() => {
  state.businessHours = [];
  state.blackouts = [];
  state.businessHourFindMany.mockReset();
  state.blackoutFindFirst.mockReset();

  state.blackoutFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; date: string } }) =>
      state.blackouts.find(
        (blackout) => blackout.tenantId === args.where.tenantId && blackout.date === args.where.date
      ) ?? null
  );
  state.businessHourFindMany.mockImplementation(
    async (args: { where: { tenantId: string; dayOfWeek: number } }) =>
      state.businessHours
        .filter(
          (hour) => hour.tenantId === args.where.tenantId && hour.dayOfWeek === args.where.dayOfWeek
        )
        .sort((left, right) => left.opensAt.localeCompare(right.opensAt))
  );
});

describe("getOpenWindows", () => {
  it("returns multiple sorted windows for the tenant weekday", async () => {
    state.businessHours = [
      { tenantId: "tenant-1", dayOfWeek: 1, opensAt: "14:00", closesAt: "18:00" },
      { tenantId: "tenant-1", dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
      { tenantId: "tenant-2", dayOfWeek: 1, opensAt: "08:00", closesAt: "16:00" },
      { tenantId: "tenant-1", dayOfWeek: 2, opensAt: "10:00", closesAt: "15:00" },
    ];

    await expect(getOpenWindows("tenant-1", "2026-07-06")).resolves.toEqual([
      { opensAt: "09:00", closesAt: "12:00" },
      { opensAt: "14:00", closesAt: "18:00" },
    ]);
    expect(state.businessHourFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", dayOfWeek: 1 },
      orderBy: [{ opensAt: "asc" }, { closesAt: "asc" }],
      select: { opensAt: true, closesAt: true },
    });
  });

  it("returns no windows when the date is blacked out", async () => {
    state.businessHours = [
      { tenantId: "tenant-1", dayOfWeek: 5, opensAt: "09:00", closesAt: "18:00" },
    ];
    state.blackouts = [{ id: "blackout-1", tenantId: "tenant-1", date: "2026-07-10" }];

    await expect(getOpenWindows("tenant-1", "2026-07-10")).resolves.toEqual([]);
    expect(state.businessHourFindMany).not.toHaveBeenCalled();
  });

  it("normalizes dates without timezone drift for DST-free local dates", () => {
    expect(toTenantLocalDate("2026-12-25")).toBe("2026-12-25");
    expect(dayOfWeekForLocalDate("2026-12-25")).toBe(5);
  });

  it("rejects malformed dates and blank tenant ids", async () => {
    expect(() => toTenantLocalDate("25-12-2026")).toThrow("YYYY-MM-DD");
    await expect(getOpenWindows(" ", "2026-07-06")).rejects.toThrow("tenantId is required");
  });
});
