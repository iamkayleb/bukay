import { describe, expect, it, vi } from "vitest";

import { dayOfWeekFromDateKey, getOpenWindows, toLocalDateKey } from "@/app/lib/availability";

describe("availability helper", () => {
  it("returns multiple windows for the requested weekday", async () => {
    const delegate = {
      blackout: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      businessHour: {
        findMany: vi.fn().mockResolvedValue([
          { opensAt: "09:00", closesAt: "12:00" },
          { opensAt: "13:00", closesAt: "17:00" },
        ]),
      },
    };

    await expect(getOpenWindows("tenant-1", "2026-07-06", delegate)).resolves.toEqual([
      { opensAt: "09:00", closesAt: "12:00" },
      { opensAt: "13:00", closesAt: "17:00" },
    ]);
    expect(delegate.businessHour.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", dayOfWeek: 1 },
      orderBy: [{ opensAt: "asc" }, { closesAt: "asc" }],
    });
  });

  it("returns no windows when the date has a blackout", async () => {
    const delegate = {
      blackout: {
        findUnique: vi.fn().mockResolvedValue({ id: "blackout-1" }),
      },
      businessHour: {
        findMany: vi.fn(),
      },
    };

    await expect(getOpenWindows("tenant-1", "2026-12-25", delegate)).resolves.toEqual([]);
    expect(delegate.blackout.findUnique).toHaveBeenCalledWith({
      where: { tenantId_date: { tenantId: "tenant-1", date: "2026-12-25" } },
      select: { id: true },
    });
    expect(delegate.businessHour.findMany).not.toHaveBeenCalled();
  });

  it("derives weekdays from a UTC date key without local timezone drift", () => {
    expect(toLocalDateKey("2026-07-05")).toBe("2026-07-05");
    expect(dayOfWeekFromDateKey("2026-07-05")).toBe(0);
    expect(dayOfWeekFromDateKey("2026-07-06")).toBe(1);
  });
});
