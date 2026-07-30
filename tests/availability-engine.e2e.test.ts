import { describe, expect, it } from "vitest";

import {
  getAvailabilityWindows,
  type AvailabilityEngineConfig,
} from "@/app/lib/availability/engine";

const config: AvailabilityEngineConfig = {
  weekdayHours: {
    monday: [
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "17:00" },
    ],
    tuesday: [{ start: "10:00", end: "14:00" }],
    wednesday: [{ start: "08:30", end: "11:30" }],
  },
  blackoutDates: ["2026-07-28"],
};

describe("availability engine e2e", () => {
  it("uses real open windows to return distinct weekday hours and skip blackout dates", () => {
    const windows = getAvailabilityWindows({ startDate: "2026-07-27", days: 3 }, config);

    expect(windows).toEqual([
      {
        date: "2026-07-27",
        weekday: "monday",
        start: "09:00",
        end: "12:00",
        startsAt: "2026-07-27T09:00:00.000Z",
        endsAt: "2026-07-27T12:00:00.000Z",
      },
      {
        date: "2026-07-27",
        weekday: "monday",
        start: "13:00",
        end: "17:00",
        startsAt: "2026-07-27T13:00:00.000Z",
        endsAt: "2026-07-27T17:00:00.000Z",
      },
      {
        date: "2026-07-29",
        weekday: "wednesday",
        start: "08:30",
        end: "11:30",
        startsAt: "2026-07-29T08:30:00.000Z",
        endsAt: "2026-07-29T11:30:00.000Z",
      },
    ]);
    expect(windows.some((window) => window.date === "2026-07-28")).toBe(false);
  });

  it("rejects invalid query ranges before generating availability", () => {
    expect(() => getAvailabilityWindows({ startDate: "2026-07-27", days: 0 }, config)).toThrow(
      "positive integer"
    );
  });
});
