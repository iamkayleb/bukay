import { describe, expect, it } from "vitest";

import { getOpenWindows, type OpenWindowsConfig } from "@/app/lib/availability/open-windows";

const config: OpenWindowsConfig = {
  weekdayHours: {
    monday: [
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "17:00" },
    ],
    tuesday: [{ start: "10:30", end: "15:00" }],
    wednesday: [{ start: "08:00", end: "11:30" }],
  },
  blackoutDates: ["2026-07-28"],
};

describe("open windows", () => {
  it("returns windows for the requested weekday configuration", () => {
    expect(getOpenWindows("2026-07-27", config)).toEqual([
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
    ]);

    expect(getOpenWindows("2026-07-29", config)).toEqual([
      {
        date: "2026-07-29",
        weekday: "wednesday",
        start: "08:00",
        end: "11:30",
        startsAt: "2026-07-29T08:00:00.000Z",
        endsAt: "2026-07-29T11:30:00.000Z",
      },
    ]);
  });

  it("returns no windows when the requested weekday has no configured hours", () => {
    expect(getOpenWindows("2026-07-30", config)).toEqual([]);
  });

  it("returns no windows on configured blackout dates", () => {
    expect(getOpenWindows("2026-07-28", config)).toEqual([]);
  });

  it("accepts Date instances and normalizes them to a UTC date key", () => {
    expect(getOpenWindows(new Date("2026-07-28T23:59:59.000Z"), config)).toEqual([]);
  });

  it("rejects malformed dates and open window times", () => {
    expect(() => getOpenWindows("07/27/2026", config)).toThrow("YYYY-MM-DD");
    expect(() => getOpenWindows("2026-02-31", config)).toThrow("valid calendar date");
    expect(() =>
      getOpenWindows("2026-07-27", {
        weekdayHours: { monday: [{ start: "9:00", end: "17:00" }] },
      })
    ).toThrow("HH:mm");
    expect(() =>
      getOpenWindows("2026-07-27", {
        weekdayHours: { monday: [{ start: "17:00", end: "09:00" }] },
      })
    ).toThrow("after start");
  });
});
