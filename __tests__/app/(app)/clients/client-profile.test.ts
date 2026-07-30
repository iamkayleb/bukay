import { describe, expect, it } from "vitest";

import {
  computeLifetimeValueCents,
  countNoShows,
  formatMoneyFromCents,
} from "@/app/(app)/clients/client-profile";

describe("client profile helpers", () => {
  it("computes lifetime value from paid payments on confirmed bookings only", () => {
    expect(
      computeLifetimeValueCents([
        {
          status: "confirmed",
          payments: [
            { amountCents: 15_000, currency: "NGN", status: "paid" },
            { amountCents: 8_000, currency: "NGN", status: "pending" },
          ],
        },
        {
          status: "pending",
          payments: [{ amountCents: 20_000, currency: "NGN", status: "paid" }],
        },
        {
          status: "cancelled",
          payments: [{ amountCents: 30_000, currency: "NGN", status: "paid" }],
        },
      ])
    ).toBe(15_000);
  });

  it("counts no-show bookings", () => {
    expect(
      countNoShows([
        { status: "confirmed" },
        { status: "no-show" },
        { status: "cancelled" },
        { status: "no-show" },
      ])
    ).toBe(2);
  });

  it("formats cents in the tenant currency", () => {
    expect(formatMoneyFromCents(125_000, "NGN")).toContain("1,250.00");
  });
});
