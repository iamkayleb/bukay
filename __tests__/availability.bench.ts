import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { computeSlots } from "@/app/lib/availability";

describe("computeSlots benchmark", () => {
  it("processes 1,000 bookings in under 50ms", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const firstBooking = new Date("2026-09-14T00:00:00.000Z").getTime();
    const bookings = Array.from({ length: 1_000 }, (_, index) => {
      const startsAt = new Date(firstBooking + index * 5 * 60_000);
      return { startsAt, endsAt: new Date(startsAt.getTime() + 3 * 60_000) };
    });

    const startedAt = performance.now();
    const slots = computeSlots({
      service: { durationMinutes: 15 },
      dateRange: {
        start: new Date("2026-09-14T00:00:00.000Z"),
        end: new Date("2026-09-20T00:00:00.000Z"),
      },
      bookings,
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        opensAt: "00:00",
        closesAt: "23:59",
      })),
      slotIntervalMinutes: 1,
      now,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(slots).toHaveLength(5_022);
    expect(elapsedMs).toBeLessThan(50);
  });
});
