import { describe, expect, it } from "vitest";

import {
  computeSlots,
  type BusinessHours,
  type ExistingBooking,
} from "@/app/lib/availability";

import "./availability.bench";

const weekdayHours: BusinessHours[] = [
  { dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
  { dayOfWeek: 2, opensAt: "09:00", closesAt: "12:00" },
  { dayOfWeek: 3, opensAt: "09:00", closesAt: "12:00", isClosed: true },
];

function slotTimes(slots: ReturnType<typeof computeSlots>) {
  return slots.map((slot) => [slot.startsAt.toISOString(), slot.endsAt.toISOString()]);
}

describe("computeSlots fixtures", () => {
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

  it("skips past earlier bookings and still blocks later overlaps", () => {
    const bookings: ExistingBooking[] = [
      {
        startsAt: "2026-07-27T08:00:00.000Z",
        endsAt: "2026-07-27T08:30:00.000Z",
      },
      {
        startsAt: "2026-07-27T10:30:00.000Z",
        endsAt: "2026-07-27T11:00:00.000Z",
      },
      {
        startsAt: "2026-07-27T13:00:00.000Z",
        endsAt: "2026-07-27T14:00:00.000Z",
      },
    ];

    const slots = computeSlots(
      { durationMinutes: 30, slotIntervalMinutes: 30 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      bookings,
      weekdayHours
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T09:30:00.000Z"],
      ["2026-07-27T09:30:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T10:30:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T11:30:00.000Z"],
      ["2026-07-27T11:30:00.000Z", "2026-07-27T12:00:00.000Z"],
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
});

describe("computeSlots edge cases", () => {
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

  it("ignores inverted booking intervals", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      [
        {
          startsAt: "2026-07-27T11:00:00.000Z",
          endsAt: "2026-07-27T10:00:00.000Z",
        },
      ],
      weekdayHours
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T11:00:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T12:00:00.000Z"],
    ]);
  });

  it("skips a weekday when the first registered hours have a malformed clock", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      [],
      [
        { dayOfWeek: 1, opensAt: "9:00", closesAt: "12:00" },
        { dayOfWeek: 1, opensAt: "09:00", closesAt: "12:00" },
      ]
    );

    expect(slots).toEqual([]);
  });

  it("accepts Date instances for range and booking bounds", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: new Date("2026-07-27T09:00:00.000Z"),
        end: new Date("2026-07-27T11:00:00.000Z"),
      },
      [
        {
          startsAt: new Date("2026-07-27T09:00:00.000Z"),
          endsAt: new Date("2026-07-27T10:00:00.000Z"),
        },
      ],
      weekdayHours
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T10:00:00.000Z", "2026-07-27T11:00:00.000Z"],
    ]);
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

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "2026-07-27T09:00:00.000Z", end: "not-a-date" },
        [],
        weekdayHours
      )
    ).toThrow("dateRange.end");

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [],
        weekdayHours,
        { afterMinutes: -5 }
      )
    ).toThrow("buffers.afterMinutes");

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [{ startsAt: "2026-07-27T09:00:00.000Z", endsAt: "bad-end" }],
        weekdayHours
      )
    ).toThrow("existingBookings.endsAt");

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [],
        weekdayHours,
        {},
        { from: "not-a-date", minutes: 10 }
      )
    ).toThrow("leadTime.from");

    expect(() =>
      computeSlots(
        { durationMinutes: 60 },
        { start: "2026-07-27T09:00:00.000Z", end: "2026-07-27T12:00:00.000Z" },
        [],
        weekdayHours,
        {},
        null,
        { from: "not-a-date", days: 1 }
      )
    ).toThrow("maxAdvance.from");
  });

  it("skips hours with out-of-range clock components", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T00:00:00.000Z",
        end: "2026-07-28T00:00:00.000Z",
      },
      [],
      [{ dayOfWeek: 1, opensAt: "24:00", closesAt: "25:00" }]
    );

    expect(slots).toEqual([]);
  });

  it("applies max advance with minutes only", () => {
    const slots = computeSlots(
      { durationMinutes: 30, slotIntervalMinutes: 30 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      [],
      weekdayHours,
      {},
      { from: "2026-07-27T08:00:00.000Z", minutes: 60 },
      { from: "2026-07-27T08:00:00.000Z", minutes: 150 }
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T09:30:00.000Z"],
      ["2026-07-27T09:30:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T10:30:00.000Z"],
      ["2026-07-27T10:30:00.000Z", "2026-07-27T11:00:00.000Z"],
    ]);
  });

  it("treats null lead time and max advance as unrestricted", () => {
    const slots = computeSlots(
      { durationMinutes: 60 },
      {
        start: "2026-07-27T09:00:00.000Z",
        end: "2026-07-27T12:00:00.000Z",
      },
      [],
      weekdayHours,
      {},
      null,
      null
    );

    expect(slotTimes(slots)).toEqual([
      ["2026-07-27T09:00:00.000Z", "2026-07-27T10:00:00.000Z"],
      ["2026-07-27T10:00:00.000Z", "2026-07-27T11:00:00.000Z"],
      ["2026-07-27T11:00:00.000Z", "2026-07-27T12:00:00.000Z"],
    ]);
  });
});
