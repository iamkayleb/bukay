import { describe, expect, it } from "vitest";

import { summarizeClientMetrics } from "@/app/lib/client-metrics";

describe("summarizeClientMetrics", () => {
  it("uses normalized booking and payment statuses for no-show and lifetime value metrics", () => {
    const metrics = summarizeClientMetrics({
      bookings: [
        {
          status: "confirmed",
          payments: [
            { amountCents: 5_000, status: "paid" },
            { amountCents: 1_500, status: "pending" },
          ],
        },
        {
          status: "NO_SHOW",
          payments: [{ amountCents: 7_500, status: " PAID " }],
        },
        {
          status: "No Show",
          payments: [{ amountCents: 2_000, status: "refunded" }],
        },
      ],
    });

    expect(metrics).toMatchObject({
      bookingCount: 3,
      lifetimeValueCents: 12_500,
      noShowCount: 2,
      unrecognizedBookingStatuses: [],
      unrecognizedPaymentStatuses: [],
    });
  });

  it("reports unrecognized persisted statuses so metric undercounts are visible", () => {
    const metrics = summarizeClientMetrics({
      bookings: [
        {
          status: "arrived",
          payments: [
            { amountCents: 5_000, status: "settled" },
            { amountCents: 3_000, status: "SETTLED" },
          ],
        },
        {
          status: " arrived ",
          payments: [{ amountCents: 1_000, status: "paid" }],
        },
      ],
    });

    expect(metrics).toMatchObject({
      bookingCount: 2,
      lifetimeValueCents: 1_000,
      noShowCount: 0,
      unrecognizedBookingStatuses: ["arrived"],
      unrecognizedPaymentStatuses: ["settled"],
    });
  });
});
