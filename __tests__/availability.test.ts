import { describe, expect, it } from "vitest";

import { computeSlots, type ComputeSlotsInput } from "@/app/lib/availability";

const at = (value: string) => new Date(`${value}T00:00:00.000Z`);
const timestamps = (input: ComputeSlotsInput) =>
  computeSlots(input).map((slot) => slot.toISOString());

const mondayHours = [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" }];

describe("computeSlots fixtures", () => {
  it("returns interval-aligned slots that fit the service within open hours", () => {
    expect(
      timestamps({
        service: { durationMinutes: 45 },
        dateRange: { start: at("2026-09-14"), end: at("2026-09-14") },
        bookings: [],
        hours: mondayHours,
        slotIntervalMinutes: 30,
        now: at("2026-09-01"),
      })
    ).toEqual([
      "2026-09-14T09:00:00.000Z",
      "2026-09-14T09:30:00.000Z",
      "2026-09-14T10:00:00.000Z",
      "2026-09-14T10:30:00.000Z",
      "2026-09-14T11:00:00.000Z",
    ]);
  });

  it("excludes slots whose service interval intersects an existing booking", () => {
    expect(
      timestamps({
        service: { durationMinutes: 30 },
        dateRange: { start: at("2026-09-14"), end: at("2026-09-14") },
        bookings: [
          {
            startsAt: new Date("2026-09-14T09:30:00.000Z"),
            endsAt: new Date("2026-09-14T10:00:00.000Z"),
          },
        ],
        hours: mondayHours,
        now: at("2026-09-01"),
      })
    ).toEqual([
      "2026-09-14T09:00:00.000Z",
      "2026-09-14T10:00:00.000Z",
      "2026-09-14T10:30:00.000Z",
      "2026-09-14T11:00:00.000Z",
      "2026-09-14T11:30:00.000Z",
    ]);
  });

  it("reserves the service buffer when determining closing-time and booking conflicts", () => {
    expect(
      timestamps({
        service: { durationMinutes: 30, bufferMinutes: 15 },
        dateRange: { start: at("2026-09-14"), end: at("2026-09-14") },
        bookings: [
          {
            startsAt: new Date("2026-09-14T10:30:00.000Z"),
            endsAt: new Date("2026-09-14T11:00:00.000Z"),
          },
        ],
        hours: [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "11:00" }],
        now: at("2026-09-01"),
      })
    ).toEqual(["2026-09-14T09:00:00.000Z", "2026-09-14T09:30:00.000Z"]);
  });

  it("honours lead time and the maximum advance window from the supplied clock", () => {
    expect(
      timestamps({
        service: { durationMinutes: 30 },
        dateRange: { start: at("2026-09-14"), end: at("2026-09-15") },
        bookings: [],
        hours: [
          { dayOfWeek: 1, opensAt: "09:00", closesAt: "10:30" },
          { dayOfWeek: 2, opensAt: "09:00", closesAt: "10:30" },
        ],
        leadTimeMinutes: 60,
        maxAdvanceDays: 1,
        now: new Date("2026-09-14T08:30:00.000Z"),
      })
    ).toEqual(["2026-09-14T09:30:00.000Z", "2026-09-14T10:00:00.000Z"]);
  });
});
