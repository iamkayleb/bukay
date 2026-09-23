import { describe, expect, it, vi } from "vitest";

import {
  calculateBalanceCents,
  calculateDepositCents,
  writeBalanceRecord,
  writeDepositRecord,
} from "@/app/lib/payments/split";

const transaction = () => ({
  payment: { create: vi.fn().mockResolvedValue({ id: "payment-1" }) },
  booking: { update: vi.fn().mockResolvedValue({ id: "booking-1" }) },
});

describe("deposit payment split", () => {
  it("calculates percentage and flat deposits without exceeding the service price", () => {
    expect(
      calculateDepositCents({ priceCents: 10_001, depositType: "percentage", depositValue: 25 })
    ).toBe(2_500);
    expect(calculateDepositCents({ priceCents: 5_000, depositType: "flat", depositValue: 6_000 })).toBe(
      5_000
    );
  });

  it("writes a paid deposit and keeps the booking confirmed with a balance outstanding", async () => {
    const db = transaction();
    const paidAt = new Date("2026-09-23T12:00:00.000Z");

    await expect(
      writeDepositRecord(db, {
        tenantId: "tenant-1",
        bookingId: "booking-1",
        currency: "NGN",
        provider: "fake",
        providerRef: "deposit-1",
        paidAt,
        service: { priceCents: 10_000, depositType: "percentage", depositValue: 30 },
      })
    ).resolves.toEqual({ amountCents: 3_000, status: "confirmed_partial" });

    expect(db.payment.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        bookingId: "booking-1",
        amountCents: 3_000,
        currency: "NGN",
        provider: "fake",
        providerRef: "deposit-1",
        status: "paid",
        paidAt,
      },
    });
    expect(db.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-1" },
      data: { status: "confirmed_partial" },
    });
  });

  it("does not mark a booking partially confirmed when no deposit is required", async () => {
    const db = transaction();

    await expect(
      writeDepositRecord(db, {
        tenantId: "tenant-1",
        bookingId: "booking-1",
        currency: "NGN",
        provider: "fake",
        providerRef: "deposit-1",
        service: { priceCents: 10_000, depositType: "none", depositValue: 0 },
      })
    ).rejects.toThrow("Service does not require a deposit");
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it("writes the remaining balance and closes the booking", async () => {
    const db = transaction();

    await expect(
      writeBalanceRecord(db, {
        tenantId: "tenant-1",
        bookingId: "booking-1",
        currency: "NGN",
        provider: "fake",
        providerRef: "balance-1",
        priceCents: 10_000,
        depositCents: 3_000,
      })
    ).resolves.toEqual({ amountCents: 7_000, status: "confirmed" });

    expect(calculateBalanceCents(10_000, 3_000)).toBe(7_000);
    expect(db.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: 7_000 }) })
    );
    expect(db.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-1" },
      data: { status: "confirmed" },
    });
  });
});
