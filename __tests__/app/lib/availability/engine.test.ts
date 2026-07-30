import { describe, expect, it } from "vitest";

import {
  getAvailabilityWindows,
  type AvailabilityEngineConfig,
} from "@/app/lib/availability/engine";

const config: AvailabilityEngineConfig = {
  weekdayHours: {
    monday: [{ start: "09:00", end: "12:00" }],
    tuesday: [{ start: "14:00", end: "17:00" }],
  },
  blackoutDates: ["2026-07-07"],
};

describe("getAvailabilityWindows", () => {
  it("loads availability for each requested date", () => {
    expect(getAvailabilityWindows({ startDate: "2026-07-06", days: 2 }, config)).toEqual([
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "09:00",
        end: "12:00",
        startsAt: "2026-07-06T09:00:00.000Z",
        endsAt: "2026-07-06T12:00:00.000Z",
      },
    ]);
  });

  it("returns no availability when the requested date is blacked out", () => {
    expect(getAvailabilityWindows({ startDate: "2026-07-07" }, config)).toEqual([]);
  });

  it("normalizes Date inputs to UTC date keys", () => {
    expect(
      getAvailabilityWindows({ startDate: new Date("2026-07-06T23:45:00.000Z") }, config)
    ).toEqual([
      {
        date: "2026-07-06",
        weekday: "monday",
        start: "09:00",
        end: "12:00",
        startsAt: "2026-07-06T09:00:00.000Z",
        endsAt: "2026-07-06T12:00:00.000Z",
      },
    ]);
  });
});
