import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  amountCents: number;
  currency: string;
  provider: string | null;
  providerRef: string | null;
  status: string;
  paidAt: Date | null;
};

type BookingRow = { id: string; tenantId: string; status: string };

const state = vi.hoisted(() => ({
  payments: [] as PaymentRow[],
  bookings: [] as BookingRow[],
  verify: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => {
      const payment = state.payments[0];
      return payment ? [{ id: payment.id, tenantId: payment.tenantId }] : [];
    }),
    payment: {
      findFirst: vi.fn(async (args: { where: { id: string; tenantId: string } }) => {
        return (
          state.payments.find(
            (payment) => payment.id === args.where.id && payment.tenantId === args.where.tenantId
          ) ?? null
        );
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<PaymentRow> }) => {
        const index = state.payments.findIndex((payment) => payment.id === args.where.id);
        state.payments[index] = { ...state.payments[index], ...args.data };
        return state.payments[index];
      }),
    },
    booking: {
      update: vi.fn(async (args: { where: { id: string }; data: Partial<BookingRow> }) => {
        const index = state.bookings.findIndex((booking) => booking.id === args.where.id);
        state.bookings[index] = { ...state.bookings[index], ...args.data };
        return state.bookings[index];
      }),
    },
  },
}));

vi.mock("@/app/lib/payments", () => ({
  getPaymentProvider: vi.fn(() => ({ name: "fake", verify: state.verify })),
}));

import { GET } from "@/app/api/payments/verify/route";

function callback(reference: string | null) {
  const query = reference ? `?reference=${encodeURIComponent(reference)}` : "";
  return new NextRequest(`http://app.test/api/payments/verify${query}`);
}

beforeEach(() => {
  state.payments = [
    {
      id: "payment-1",
      tenantId: "tenant-1",
      bookingId: "booking-1",
      amountCents: 12500,
      currency: "NGN",
      provider: "fake",
      providerRef: "booking-1-ref",
      status: "pending",
      paidAt: null,
    },
  ];
  state.bookings = [{ id: "booking-1", tenantId: "tenant-1", status: "pending_payment" }];
  state.verify.mockReset();
});

describe("GET /api/payments/verify", () => {
  it("confirms the booking when test-mode verification succeeds", async () => {
    const paidAt = new Date("2026-09-16T10:00:00.000Z");
    state.verify.mockResolvedValue({
      provider: "fake",
      reference: "booking-1-ref",
      status: "success",
      amount: 12500,
      currency: "NGN",
      paidAt,
    });

    const response = await GET(callback("booking-1-ref"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      bookingId: "booking-1",
      status: "confirmed",
    });
    expect(state.verify).toHaveBeenCalledWith("booking-1-ref");
    expect(state.payments[0]).toMatchObject({ status: "success", paidAt });
    expect(state.bookings[0].status).toBe("confirmed");
  });

  it("does not update records when provider values do not match the payment", async () => {
    state.verify.mockResolvedValue({
      provider: "fake",
      reference: "booking-1-ref",
      status: "success",
      amount: 1,
      currency: "NGN",
      paidAt: new Date(),
    });

    const response = await GET(callback("booking-1-ref"));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "payment_verification_mismatch" });
    expect(state.payments[0].status).toBe("pending");
    expect(state.bookings[0].status).toBe("pending_payment");
  });

  it("records a failed payment without confirming the booking", async () => {
    state.verify.mockResolvedValue({
      provider: "fake",
      reference: "booking-1-ref",
      status: "failed",
      amount: 12500,
      currency: "NGN",
      paidAt: null,
    });

    const response = await GET(callback("booking-1-ref"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, bookingId: "booking-1", status: "failed" });
    expect(state.payments[0].status).toBe("failed");
    expect(state.bookings[0].status).toBe("payment_failed");
  });

  it("rejects a callback without a reference", async () => {
    const response = await GET(callback(null));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "reference_required" });
  });
});
