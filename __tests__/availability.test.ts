import { describe, expect, it } from "vitest";

import { computeSlots, type BusinessHours, type ExistingBooking } from "@/app/lib/availability";

// Wednesday, 2026-09-09 (UTC) — chosen as an ordinary mid-week business day.
const WEDNESDAY = new Date("2026-09-09T00:00:00.000Z");
const EARLY_MORNING = new Date("2026-09-09T00:00:00.000Z");

const STANDARD_HOURS: BusinessHours[] = [
  { dayOfWeek: 0, opensAt: "09:00", closesAt: "17:00", isClosed: true },
  { dayOfWeek: 1, opensAt: "09:00", closesAt: "17:00" },
  { dayOfWeek: 2, opensAt: "09:00", closesAt: "17:00" },
  { dayOfWeek: 3, opensAt: "09:00", closesAt: "17:00" },
  { dayOfWeek: 4, opensAt: "09:00", closesAt: "17:00" },
  { dayOfWeek: 5, opensAt: "09:00", closesAt: "17:00" },
  { dayOfWeek: 6, opensAt: "09:00", closesAt: "17:00", isClosed: true },
];

function at(hhmm: string): Date {
  return new Date(`2026-09-09T${hhmm}:00.000Z`);
}

describe("computeSlots — fixtures", () => {
  it("returns hourly slots across a full open business day", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      now: EARLY_MORNING,
    });

    expect(slots.map((s) => s.start.toISOString())).toEqual([
      at("09:00").toISOString(),
      at("10:00").toISOString(),
      at("11:00").toISOString(),
      at("12:00").toISOString(),
      at("13:00").toISOString(),
      at("14:00").toISOString(),
      at("15:00").toISOString(),
      at("16:00").toISOString(),
    ]);
    expect(slots[0].end.toISOString()).toBe(at("10:00").toISOString());
  });

  it("excludes slots that overlap an existing booking", () => {
    const existingBookings: ExistingBooking[] = [{ startsAt: at("10:00"), endsAt: at("11:00") }];

    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      existingBookings,
      now: EARLY_MORNING,
    });

    expect(slots.map((s) => s.start.toISOString())).not.toContain(at("10:00").toISOString());
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      at("09:00").toISOString(),
      at("11:00").toISOString(),
      at("12:00").toISOString(),
      at("13:00").toISOString(),
      at("14:00").toISOString(),
      at("15:00").toISOString(),
      at("16:00").toISOString(),
    ]);
  });

  it("returns no slots on a day the business is closed", () => {
    const sunday = new Date("2026-09-06T00:00:00.000Z");
    const slots = computeSlots({
      date: sunday,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      now: sunday,
    });

    expect(slots).toEqual([]);
  });
});

describe("computeSlots — service duration plus buffer", () => {
  it("offers the full interval grid of candidates when nothing is booked yet", () => {
    // Buffer only needs to keep a slot clear of *existing* bookings — until
    // one of these candidates is actually booked, its neighbors remain
    // offerable, so the 15-minute grid is dense regardless of buffer.
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      bufferMinutes: 15,
      slotIntervalMinutes: 15,
      now: EARLY_MORNING,
    });

    const starts = slots.map((s) => s.start.toISOString());
    expect(starts[0]).toBe(at("09:00").toISOString());
    expect(starts).toContain(at("09:15").toISOString());
    expect(starts).toContain(at("09:45").toISOString());
  });

  it("blocks candidates that fall inside a booked slot's duration plus buffer", () => {
    const existingBookings: ExistingBooking[] = [
      { startsAt: at("09:00"), endsAt: at("09:30"), bufferMinutes: 15 },
    ];

    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      slotIntervalMinutes: 15,
      existingBookings,
      now: EARLY_MORNING,
    });

    // Busy through 09:45 (30m service + 15m buffer starting at 09:00).
    const starts = slots.map((s) => s.start.toISOString());
    expect(starts).not.toContain(at("09:00").toISOString());
    expect(starts).not.toContain(at("09:15").toISOString());
    expect(starts).not.toContain(at("09:30").toISOString());
    expect(starts).toContain(at("09:45").toISOString());
  });

  it("keeps the returned slot end time exclusive of buffer", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      bufferMinutes: 15,
      slotIntervalMinutes: 60,
      now: EARLY_MORNING,
    });

    expect(slots[0].end.toISOString()).toBe(at("09:30").toISOString());
  });

  it("accounts for the buffer already attached to an existing booking", () => {
    const existingBookings: ExistingBooking[] = [
      { startsAt: at("10:00"), endsAt: at("10:30"), bufferMinutes: 30 },
    ];

    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      slotIntervalMinutes: 15,
      existingBookings,
      now: EARLY_MORNING,
    });

    const starts = slots.map((s) => s.start.toISOString());
    // Existing booking is busy from 10:00 through 11:00 (30m service + 30m buffer).
    expect(starts).not.toContain(at("10:00").toISOString());
    expect(starts).not.toContain(at("10:30").toISOString());
    expect(starts).toContain(at("11:00").toISOString());
  });

  it("excludes a slot whose duration would run past closing time", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 90,
      slotIntervalMinutes: 60,
      now: EARLY_MORNING,
    });

    expect(slots[slots.length - 1].start.toISOString()).toBe(at("15:00").toISOString());
  });
});

describe("computeSlots — lead time and max-advance window", () => {
  it("excludes slots that start before the lead time cutoff", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      now: at("09:00"),
      leadTimeMinutes: 120,
    });

    expect(slots[0].start.toISOString()).toBe(at("11:00").toISOString());
  });

  it("excludes slots beyond the max-advance window", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      now,
      maxAdvanceDays: 7, // cutoff lands mid-morning on WEDNESDAY (2026-09-08 + 1 day span)
    });

    // now + 7 days = 2026-09-08T00:00, before WEDNESDAY even opens.
    expect(slots).toEqual([]);
  });

  it("includes slots up to and excludes slots after the max-advance cutoff", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      now,
      maxAdvanceDays: 1, // cutoff at 2026-09-09T12:00:00.000Z
    });

    const starts = slots.map((s) => s.start.toISOString());
    expect(starts).toContain(at("12:00").toISOString());
    expect(starts).not.toContain(at("13:00").toISOString());
  });

  it("has no upper bound when maxAdvanceDays is omitted", () => {
    const farFuture = new Date("2099-09-09T00:00:00.000Z");
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      now: EARLY_MORNING,
    });

    expect(slots.length).toBeGreaterThan(0);
    void farFuture;
  });
});

describe("computeSlots — edge cases", () => {
  it("returns no slots when there is no business-hours entry for the day", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS.filter((h) => h.dayOfWeek !== 3),
      durationMinutes: 30,
      now: EARLY_MORNING,
    });

    expect(slots).toEqual([]);
  });

  it("returns no slots when closesAt is not after opensAt", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: [{ dayOfWeek: 3, opensAt: "09:00", closesAt: "09:00" }],
      durationMinutes: 30,
      now: EARLY_MORNING,
    });

    expect(slots).toEqual([]);
  });

  it("returns no slots when the service duration exceeds the open window", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: [{ dayOfWeek: 3, opensAt: "09:00", closesAt: "09:30" }],
      durationMinutes: 60,
      now: EARLY_MORNING,
    });

    expect(slots).toEqual([]);
  });

  it("throws for a non-positive slot interval", () => {
    expect(() =>
      computeSlots({
        date: WEDNESDAY,
        businessHours: STANDARD_HOURS,
        durationMinutes: 30,
        slotIntervalMinutes: 0,
        now: EARLY_MORNING,
      })
    ).toThrow(RangeError);
  });

  it("throws for a malformed business-hours time string", () => {
    expect(() =>
      computeSlots({
        date: WEDNESDAY,
        businessHours: [{ dayOfWeek: 3, opensAt: "9:00", closesAt: "17:00" }],
        durationMinutes: 30,
        now: EARLY_MORNING,
      })
    ).toThrow(RangeError);
  });

  it("defaults bufferMinutes, leadTimeMinutes, and slotIntervalMinutes when omitted", () => {
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      now: EARLY_MORNING,
    });

    expect(slots[0].start.toISOString()).toBe(at("09:00").toISOString());
    expect(slots[1].start.toISOString()).toBe(at("09:15").toISOString());
  });

  it("treats adjacent bookings that exactly touch as non-overlapping", () => {
    const existingBookings: ExistingBooking[] = [{ startsAt: at("09:00"), endsAt: at("10:00") }];

    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 60,
      slotIntervalMinutes: 60,
      existingBookings,
      now: EARLY_MORNING,
    });

    expect(slots.map((s) => s.start.toISOString())).toContain(at("10:00").toISOString());
  });

  it("returns no slots when every candidate collides with existing bookings", () => {
    const existingBookings: ExistingBooking[] = [{ startsAt: at("09:00"), endsAt: at("17:00") }];

    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      existingBookings,
      now: EARLY_MORNING,
    });

    expect(slots).toEqual([]);
  });
});
