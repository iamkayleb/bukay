import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  getOpenWindows: vi.fn(),
}));

vi.mock("@/app/lib/availability/open-windows", () => ({
  getOpenWindows: calls.getOpenWindows,
  toTenantLocalDate: (value: Date | string) =>
    typeof value === "string" ? value : value.toISOString().slice(0, 10),
}));

import {
  type AvailabilityEngineConfig,
  getAvailabilityWindows,
} from "@/app/lib/availability/engine";

const config: AvailabilityEngineConfig = {
  weekdayHours: {
    monday: [
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:00" },
    ],
  },
};

describe("getAvailabilityWindows", () => {
  it("uses getOpenWindows to load availability for the requested tenant date", async () => {
    calls.getOpenWindows.mockReturnValue([
      { date: "2026-07-06", weekday: "monday", start: "09:00", end: "12:00" },
      { date: "2026-07-06", weekday: "monday", start: "14:00", end: "17:00" },
    ]);

    expect(getAvailabilityWindows({ startDate: "2026-07-06" }, config)).toEqual([
      { date: "2026-07-06", weekday: "monday", start: "09:00", end: "12:00" },
      { date: "2026-07-06", weekday: "monday", start: "14:00", end: "17:00" },
    ]);

    expect(calls.getOpenWindows).toHaveBeenCalledWith("2026-07-06", config);
  });

  it("returns no availability when getOpenWindows reports a blackout", async () => {
    calls.getOpenWindows.mockReturnValue([]);

    expect(getAvailabilityWindows({ startDate: "2026-12-25" }, config)).toEqual([]);
  });

  it("normalizes Date inputs through the availability helper", async () => {
    const date = new Date("2026-07-06T23:45:00.000Z");
    calls.getOpenWindows.mockReturnValue([
      { date: "2026-07-06", weekday: "monday", start: "16:00", end: "18:00" },
    ]);

    expect(getAvailabilityWindows({ startDate: date }, config)).toEqual([
      { date: "2026-07-06", weekday: "monday", start: "16:00", end: "18:00" },
    ]);

    expect(calls.getOpenWindows).toHaveBeenCalledWith("2026-07-06", config);
  });
});
