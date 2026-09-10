import { describe, expect, it } from "vitest";

import { computeSlots } from "@/app/lib/availability";

describe("computeSlots benchmark", () => {
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
});
