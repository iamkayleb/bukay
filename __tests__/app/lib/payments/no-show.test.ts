import { beforeEach, describe, expect, it, vi } from "vitest";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  kind: string;
  amountCents: number;
  currency: string;
  status: string;
};

type BookingRow = { id: string; tenantId: string; status: string };

type LedgerEntryRow = {
  id: string;
  tenantId: string;
  bookingId: string | null;
  type: string;
  amountCents: number;
  currency: string;
  notes: string | null;
};

const state = vi.hoisted(() => ({
  payments: [] as PaymentRow[],
  bookings: [] as BookingRow[],
  ledgerEntries: [] as LedgerEntryRow[],
  nextId: 0,
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    payment: {
      findFirst: vi.fn(
        async (args: {
          where: { tenantId: string; bookingId: string; kind: string; status: string };
        }) =>
          state.payments.find(
            (payment) =>
              payment.tenantId === args.where.tenantId &&
              payment.bookingId === args.where.bookingId &&
              payment.kind === args.where.kind &&
              payment.status === args.where.status
          ) ?? null
      ),
    },
    booking: {
      update: vi.fn(async (args: { where: { id: string }; data: Partial<BookingRow> }) => {
        const index = state.bookings.findIndex((booking) => booking.id === args.where.id);
        state.bookings[index] = { ...state.bookings[index], ...args.data };
        return state.bookings[index];
      }),
    },
    ledgerEntry: {
      create: vi.fn(async (args: { data: Omit<LedgerEntryRow, "id"> }) => {
        const entry: LedgerEntryRow = { id: `ledger-${state.nextId++}`, ...args.data };
        state.ledgerEntries.push(entry);
        return entry;
      }),
    },
  },
}));

import { chargeNoShowFee } from "@/app/lib/payments/no-show";

beforeEach(() => {
  state.payments = [
    {
      id: "payment-deposit-1",
      tenantId: "tenant-1",
      bookingId: "booking-1",
      kind: "deposit",
      amountCents: 3000,
      currency: "NGN",
      status: "success",
    },
  ];
  state.bookings = [{ id: "booking-1", tenantId: "tenant-1", status: "confirmed_partial" }];
  state.ledgerEntries = [];
  state.nextId = 0;
});

describe("chargeNoShowFee", () => {
  it("marks the booking no_show and writes a LedgerEntry for the forfeited deposit", async () => {
    const result = await chargeNoShowFee({ tenantId: "tenant-1", bookingId: "booking-1" });

    expect(result).not.toBeNull();
    expect(result?.booking.status).toBe("no_show");
    expect(result?.ledgerEntry).toMatchObject({
      tenantId: "tenant-1",
      bookingId: "booking-1",
      type: "no_show_fee",
      amountCents: 3000,
      currency: "NGN",
    });
    expect(state.ledgerEntries).toHaveLength(1);
    expect(state.bookings[0].status).toBe("no_show");
  });

  it("returns null and makes no changes when no deposit was ever paid", async () => {
    state.payments = [];

    const result = await chargeNoShowFee({ tenantId: "tenant-1", bookingId: "booking-1" });

    expect(result).toBeNull();
    expect(state.ledgerEntries).toHaveLength(0);
    expect(state.bookings[0].status).toBe("confirmed_partial");
  });
});
