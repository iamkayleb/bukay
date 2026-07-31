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
    calls.getOpenWindows.mockReturnValue([
      { date: "2026-07-06", start: "09:00", end: "12:00" },
      { date: "2026-07-06", start: "14:00", end: "17:00" },
    ]);

    expect(getAvailabilityWindows({ startDate: "2026-07-06" }, { weekdayHours: {} })).toEqual([
      { date: "2026-07-06", start: "09:00", end: "12:00" },
      { date: "2026-07-06", start: "14:00", end: "17:00" },
    ]);

    expect(calls.getOpenWindows).toHaveBeenCalledWith("2026-07-06", { weekdayHours: {} });
  });

  it("returns no availability when getOpenWindows reports a blackout", async () => {
    calls.getOpenWindows.mockReturnValue([]);

    expect(getAvailabilityWindows({ startDate: "2026-12-25" }, { weekdayHours: {} })).toEqual([]);
  });

  it("normalizes Date inputs before loading open windows", async () => {
    const date = new Date("2026-07-06T23:45:00.000Z");
    calls.getOpenWindows.mockReturnValue([{ date: "2026-07-06", start: "16:00", end: "18:00" }]);

    expect(getAvailabilityWindows({ startDate: date }, { weekdayHours: {} })).toEqual([
      { date: "2026-07-06", start: "16:00", end: "18:00" },
    ]);

    expect(calls.getOpenWindows).toHaveBeenCalledWith("2026-07-06", { weekdayHours: {} });
  });
});
