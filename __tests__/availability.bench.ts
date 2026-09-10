import { describe, expect, it } from "vitest";

import { computeSlots, type BusinessHours, type ExistingBooking } from "@/app/lib/availability";

const WEDNESDAY = new Date("2026-09-09T00:00:00.000Z");

const STANDARD_HOURS: BusinessHours[] = [{ dayOfWeek: 3, opensAt: "09:00", closesAt: "17:00" }];

function buildExistingBookings(count: number): ExistingBooking[] {
  const bookings: ExistingBooking[] = [];
  const oneDayMs = 24 * 60 * 60_000;
  const baseDay = Date.UTC(2026, 7, 1, 9, 0);
  for (let i = 0; i < count; i += 1) {
    // One booking per day across ~2.7 years of tenant history, so the
    // overlap check still scans all 1000 entries without blanketing the
    // single target day under test.
    const start = baseDay + i * oneDayMs;
    bookings.push({
      startsAt: new Date(start),
      endsAt: new Date(start + 30 * 60_000),
      bufferMinutes: 10,
    });
  }
  return bookings;
}

describe("computeSlots — benchmark", () => {
  it("computes a day of slots against 1000 existing bookings in under 50ms", () => {
    const existingBookings = buildExistingBookings(1000);

    const start = performance.now();
    const slots = computeSlots({
      date: WEDNESDAY,
      businessHours: STANDARD_HOURS,
      durationMinutes: 30,
      bufferMinutes: 10,
      slotIntervalMinutes: 15,
      existingBookings,
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    const elapsed = performance.now() - start;

    expect(slots.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });
});
