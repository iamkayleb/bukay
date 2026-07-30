import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  getOpenWindows: vi.fn(),
}));

vi.mock("@/app/lib/availability/open-windows", () => ({
  getOpenWindows: calls.getOpenWindows,
}));

import { getAvailabilityWindows } from "@/app/lib/availability/engine";

const config = { weekdayHours: {} };

describe("getAvailabilityWindows", () => {
  it("uses getOpenWindows to load availability for the requested tenant date", async () => {
    calls.getOpenWindows.mockReturnValue([
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "09:00",
        end: "12:00",
        startsAt: "2026-07-06T09:00:00.000Z",
        endsAt: "2026-07-06T12:00:00.000Z",
      },
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "14:00",
        end: "17:00",
        startsAt: "2026-07-06T14:00:00.000Z",
        endsAt: "2026-07-06T17:00:00.000Z",
      },
    ]);

    expect(getAvailabilityWindows({ startDate: "2026-07-06" }, config)).toEqual([
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "09:00",
        end: "12:00",
        startsAt: "2026-07-06T09:00:00.000Z",
        endsAt: "2026-07-06T12:00:00.000Z",
      },
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "14:00",
        end: "17:00",
        startsAt: "2026-07-06T14:00:00.000Z",
        endsAt: "2026-07-06T17:00:00.000Z",
      },
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
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "16:00",
        end: "18:00",
        startsAt: "2026-07-06T16:00:00.000Z",
        endsAt: "2026-07-06T18:00:00.000Z",
      },
    ]);

    expect(getAvailabilityWindows({ startDate: date }, config)).toEqual([
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "16:00",
        end: "18:00",
        startsAt: "2026-07-06T16:00:00.000Z",
        endsAt: "2026-07-06T18:00:00.000Z",
      },
    ]);

    expect(calls.getOpenWindows).toHaveBeenCalledWith("2026-07-06", config);
  });
});
