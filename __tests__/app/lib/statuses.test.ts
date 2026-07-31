import { describe, expect, it } from "vitest";

import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  calculateLifetimeValueCents,
  canonicalizeBookingStatus,
  canonicalizePaymentStatus,
  countNoShowBookings,
  isConfirmedBookingStatus,
  isNoShowBookingStatus,
  isPaidPaymentStatus,
} from "@/app/lib/statuses";

describe("status normalization", () => {
  it("canonicalizes booking statuses used by metrics", () => {
    expect(canonicalizeBookingStatus(" confirmed ")).toBe(BOOKING_STATUS.confirmed);
    expect(canonicalizeBookingStatus("CONFIRMED")).toBe(BOOKING_STATUS.confirmed);
    expect(canonicalizeBookingStatus("no_show")).toBe(BOOKING_STATUS.noShow);
    expect(canonicalizeBookingStatus("No Show")).toBe(BOOKING_STATUS.noShow);
    expect(canonicalizeBookingStatus("no--show")).toBe(BOOKING_STATUS.noShow);
    expect(canonicalizeBookingStatus("not-a-real-status")).toBeNull();
  });

  it("canonicalizes payment statuses used by lifetime value", () => {
    expect(canonicalizePaymentStatus(" paid ")).toBe(PAYMENT_STATUS.paid);
    expect(canonicalizePaymentStatus("PAID")).toBe(PAYMENT_STATUS.paid);
    expect(canonicalizePaymentStatus("pending")).toBe(PAYMENT_STATUS.pending);
    expect(canonicalizePaymentStatus("settled")).toBeNull();
  });

  it("uses normalized predicates instead of hard-coded raw strings", () => {
    expect(isConfirmedBookingStatus(" Confirmed ")).toBe(true);
    expect(isNoShowBookingStatus("NO_SHOW")).toBe(true);
    expect(isPaidPaymentStatus("Paid")).toBe(true);
    expect(isPaidPaymentStatus("failed")).toBe(false);
  });
});

describe("status-backed metrics", () => {
  it("calculates lifetime value from normalized paid payments only", () => {
    expect(
      calculateLifetimeValueCents([
        { amountCents: 5_000, status: "paid" },
        { amountCents: 7_500, status: " PAID " },
        { amountCents: 1_000, status: "pending" },
        { amountCents: 2_000, status: "refunded" },
      ])
    ).toBe(12_500);
  });

  it("counts no-shows across persisted hyphen, underscore, and spaced forms", () => {
    expect(
      countNoShowBookings([
        { status: "no-show" },
        { status: "NO_SHOW" },
        { status: "No Show" },
        { status: "confirmed" },
      ])
    ).toBe(3);
  });
});
