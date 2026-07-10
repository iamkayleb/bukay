import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  getOpenWindows: vi.fn(),
}));

vi.mock("@/app/lib/availability/open-windows", () => ({
  getOpenWindows: calls.getOpenWindows,
}));

import { getAvailabilityWindows } from "@/app/lib/availability/engine";

describe("getAvailabilityWindows", () => {
  it("uses getOpenWindows to load availability for the requested tenant date", async () => {
    calls.getOpenWindows.mockResolvedValue([
      { opensAt: "09:00", closesAt: "12:00" },
      { opensAt: "14:00", closesAt: "17:00" },
    ]);

    await expect(
      getAvailabilityWindows({ tenantId: "tenant-1", date: "2026-07-06" })
    ).resolves.toEqual([
      { date: "2026-07-06", opensAt: "09:00", closesAt: "12:00" },
      { date: "2026-07-06", opensAt: "14:00", closesAt: "17:00" },
    ]);

    expect(calls.getOpenWindows).toHaveBeenCalledWith("tenant-1", "2026-07-06");
  });

  it("returns no availability when getOpenWindows reports a blackout", async () => {
    calls.getOpenWindows.mockResolvedValue([]);

    await expect(
      getAvailabilityWindows({ tenantId: "tenant-1", date: "2026-12-25" })
    ).resolves.toEqual([]);
  });
});
