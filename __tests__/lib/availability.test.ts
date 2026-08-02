import { describe, expect, it } from "vitest";

import { computeSlots, type BusinessHours, type ExistingBooking } from "@/lib/availability";

const weekdayHours: BusinessHours[] = [
  { dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
  { dayOfWeek: 2, opensAt: "09:00", closesAt: "12:00" },
  { dayOfWeek: 3, opensAt: "09:00", closesAt: "12:00", isClosed: true },
];

function slotTimes(slots: ReturnType<typeof computeSlots>) {
  return slots.map((slot) => [slot.startsAt.toISOString(), slot.endsAt.toISOString()]);
}

describe("computeSlots", () => {
  it("returns duration-sized slots inside business hours", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T00:00:00.000Z",
        end: "2026-07-28T00:00:00.000Z",
      },
      [],
      weekdayHours
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T11:00:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T12:00:00.000Z"],
    ]);
  });

  it("uses slot intervals without changing the service duration", () => {
    const slots = computeSlots(
      { durationMinutes: 60, slotIntervalMinutes: 30 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      [],
      weekdayHours
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T09:30:00.000Z", "2026-07-27T10:30:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T11:00:00.000Z"],
      ["2026-07-27T10:30:00.000Z", "2026-07-27T11:30:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T12:00:00.000Z"],
    ]);
  });

  it("clamps slots to the requested date range and aligns starts to slot boundaries", () => {
    const slots = computeSlots(
      { durationMinutes: 30, slotIntervalMinutes: 15 },
      {
        start: "2026-07-27T09:07:00.000Z",
        end: "2026-07-27T10:10:00.000Z",
      },
      [],
      weekdayHours
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:15:00.000Z", "2026-07-27T09:45:00.000Z"],
      ["2026-07-27T09:30:00.000Z", "2026-07-27T10:00:00.000Z"],
    ]);
  });

  it("filters slots that overlap existing bookings", () => {
    const bookings: ExistingBooking[] = [
      {
        startsAt: "2026-07-27T10:00:00.000Z",
        endsAt: "2026-07-27T11:00:00.000Z",
      },
    ];

    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      bookings,
      weekdayHours
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T12:00:00.000Z"],
    ]);
  });

  it("applies before and after buffers around candidate slots", () => {
    const bookings: ExistingBooking[] = [
      {
        startsAt: "2026-07-27T10:00:00.000Z",
        endsAt: "2026-07-27T10:30:00.000Z",
      },
    ];

    const slots = computeSlots(
      { durationMinutes: 30, slotIntervalMinutes: 15 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      bookings,
      weekdayHours,
      { beforeMinutes: 15, afterMinutes: 15 }
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T09:30:00.000Z"],
      ["2026-07-27T09:15:00.000Z", "2026-07-27T09:45:00.000Z"],
      ["2026-07-27T10:45:00.000Z", "2026-07-27T11:15:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T11:30:00.000Z"],
      ["2026-07-27T11:15:00.000Z", "2026-07-27T11:45:00.000Z"],
      ["2026-07-27T11:30:00.000Z", "2026-07-27T12:00:00.000Z"],
    ]);
  });

  it("applies lead time and max advance windows from explicit reference times", () => {
    const slots = computeSlots(
      { durationMinutes: 30, slotIntervalMinutes: 30 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-28T12:00:00.000Z",
      },
      [],
      weekdayHours,
      {},
      { from: "2026-07-27T08:00:00.000Z", minutes: 90 },
      { from: "2026-07-27T08:00:00.000Z", days: 1, minutes: 90 }
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:30:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T10:30:00.000Z"],
      ["2026-07-27T10:30:00.000Z", "2026-07-27T11:00:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T11:30:00.000Z"],
      ["2026-07-27T11:30:00.000Z", "2026-07-27T12:00:00.000Z"],
      ["2026-07-28T09:00:00.000Z", "2026-07-28T09:30:00.000Z"],
      ["2026-07-28T09:30:00.000Z", "2026-07-28T10:00:00.000Z"],
    ]);
  });

  it("skips missing, closed, and invalid business hours", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T00:00:00.000Z",
        end: "2026-07-31T00:00:00.000Z",
      },
      [],
      [...weekdayHours, { dayOfWeek: 4, opensAt: "13:00", closesAt: "12:00" }]
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T11:00:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T12:00:00.000Z"],
      ["2026-07-28T09:00:00.000Z", "2026-07-28T10:00:00.000Z"],
      ["2026-07-28T10:00:00.000Z", "2026-07-28T11:00:00.000Z"],
      ["2026-07-28T11:00:00.000Z", "2026-07-28T12:00:00.000Z"],
    ]);
  });

  it("returns no slots for empty ranges or impossible windows", () => {
    expect(
      computeSlots(
        { durationMinutes: 60 },
        {
          start: "2026-07-27T12:00:00.000Z",
          end: "2026-07-27T09:00:00.000Z",
        },
        [],
        weekdayHours
      )
    ).toEqual([]);

    expect(
      computeSlots(
        { durationMinutes: 60 },
        {
          start: "2026-07-27T09:00:00.000Z",
          end: "2026-07-27T12:00:00.000Z",
        },
        [],
        weekdayHours,
        {},
        { from: "2026-07-27T09:00:00.000Z", days: 2 },
        { from: "2026-07-27T09:00:00.000Z", days: 1 }
      )
    ).toEqual([]);
  });

  it("accepts absolute lead time and max advance timestamps", () => {
    const slots = computeSlots(
      { durationMinutes: 30, slotIntervalMinutes: 30 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      [],
      weekdayHours,
      {},
      new Date("2026-07-27T10:00:00.000Z").getTime(),
      new Date("2026-07-27T10:30:00.000Z").getTime()
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T10:00:00.000Z", "2026-07-27T10:30:00.000Z"],
      ["2026-07-27T10:30:00.000Z", "2026-07-27T11:00:00.000Z"],
    ]);
  });

  it("handles duplicate hours by keeping the first configuration for a weekday", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T00:00:00.000Z",
        end: "2026-07-27T18:00:00.000Z",
      },
      [],
      [
        { dayOfWeek: 1, opensAt: "09:00", closesAt: "10:00" },
        { dayOfWeek: 1, opensAt: "12:00", closesAt: "18:00" },
      ]
    );

    expect(slotTimes(slots)).toEqual([["2026-07-27T09:00:00.000Z", "2026-07-27T10:00:00.000Z"]]);
  });

  it("runs under 50ms with 1000 bookings in one day", () => {
    const bookings = Array.from({ length: 1000 }, (_, index) => {
      const startsAt = new Date(Date.UTC(2026, 6, 27, 0, index % 60, index % 2));
      const endsAt = new Date(startsAt.getTime() + 30_000);
      return { startsAt, endsAt };
    });

    const startedAt = performance.now();
    const slots = computeSlots(
      { durationMinutes: 15, slotIntervalMinutes: 5 },
      {
        start: "2026-07-27T00:00:00.000Z",
        end: "2026-07-28T00:00:00.000Z",
      },
      bookings,
      [{ dayOfWeek: 1, opensAt: "00:00", closesAt: "23:59" }]
    );
    const elapsedMs = performance.now() - startedAt;

    expect(slots.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(50);
  });

  it("rejects invalid service, buffer, and date inputs", () => {
    expect(() =>
      computeSlots(
        { durationMinutes: 0 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [],
        weekdayHours
      )
    ).toThrow("service.durationMinutes");

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "not-a-date", end: "2026-07-27T12:00:00.000Z" },
        [],
        weekdayHours
      )
    ).toThrow("dateRange.start");

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [],
        weekdayHours,
        { beforeMinutes: -1 }
      )
    ).toThrow("buffers.beforeMinutes");

    expect(() =>
      computeSlots(
        { durationMinutes: 60, slotIntervalMinutes: 0 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [],
        weekdayHours
      )
    ).toThrow("service.slotIntervalMinutes");

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [{ startsAt: "not-a-date", endsAt: "2026-07-27T10:00:00.000Z" }],
        weekdayHours
      )
    ).toThrow("existingBookings.startsAt");
  });
});
