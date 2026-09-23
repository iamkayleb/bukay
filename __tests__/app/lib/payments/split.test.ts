import { beforeEach, describe, expect, it, vi } from "vitest";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  kind: string;
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
  nextId: 0,
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    payment: {
      create: vi.fn(async (args: { data: Omit<PaymentRow, "id"> }) => {
        const payment: PaymentRow = { id: `payment-${state.nextId++}`, ...args.data };
        state.payments.push(payment);
        return payment;
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

import { computeDepositSplit, recordDepositPayment } from "@/app/lib/payments/split";

beforeEach(() => {
  state.payments = [];
  state.bookings = [{ id: "booking-1", tenantId: "tenant-1", status: "pending_payment" }];
  state.nextId = 0;
});

describe("computeDepositSplit", () => {
  it("splits a percentage deposit and leaves the remainder as balance", () => {
    expect(computeDepositSplit(10000, { depositType: "percent", depositValue: 30 })).toEqual({
      depositCents: 3000,
      balanceCents: 7000,
    });
  });

  it("splits a flat-amount deposit", () => {
    expect(computeDepositSplit(10000, { depositType: "flat", depositValue: 2500 })).toEqual({
      depositCents: 2500,
      balanceCents: 7500,
    });
  });

  it("caps a flat deposit at the full price", () => {
    expect(computeDepositSplit(1000, { depositType: "flat", depositValue: 5000 })).toEqual({
      depositCents: 1000,
      balanceCents: 0,
    });
  });

  it("treats no deposit configuration as full payment upfront", () => {
    expect(computeDepositSplit(10000, { depositType: null, depositValue: null })).toEqual({
      depositCents: 10000,
      balanceCents: 0,
    });
  });
});

describe("recordDepositPayment", () => {
  it("writes a successful deposit record, a pending balance record, and holds the booking as confirmed_partial", async () => {
    const result = await recordDepositPayment({
      tenantId: "tenant-1",
      bookingId: "booking-1",
      priceCents: 10000,
      currency: "NGN",
      depositType: "percent",
      depositValue: 30,
    });

    expect(result.deposit).toMatchObject({
      kind: "deposit",
      amountCents: 3000,
      status: "success",
    });
    expect(result.balance).toMatchObject({
      kind: "balance",
      amountCents: 7000,
      status: "pending",
    });
    expect(result.booking.status).toBe("confirmed_partial");
    expect(state.payments).toHaveLength(2);
    expect(state.bookings[0].status).toBe("confirmed_partial");
  });

  it("does not write a balance record and confirms the booking outright when there is no deposit split", async () => {
    const result = await recordDepositPayment({
      tenantId: "tenant-1",
      bookingId: "booking-1",
      priceCents: 5000,
      currency: "NGN",
      depositType: null,
      depositValue: null,
    });

    expect(result.deposit).toMatchObject({ kind: "deposit", amountCents: 5000 });
    expect(result.balance).toBeNull();
    expect(result.booking.status).toBe("confirmed");
    expect(state.payments).toHaveLength(1);
  });
});
