import { beforeEach, describe, expect, it, vi } from "vitest";

type LedgerEntryRow = {
  id: string;
  tenantId: string;
  bookingId: string | null;
  paymentId: string | null;
  type: string;
  amountCents: number;
  currency: string;
  sourceRef: string;
  notes: string | null;
};

const state = vi.hoisted(() => ({
  ledgerEntries: [] as LedgerEntryRow[],
  nextId: 0,
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    ledgerEntry: {
      create: vi.fn(async (args: { data: Omit<LedgerEntryRow, "id"> }) => {
        const entry: LedgerEntryRow = { id: `ledger-${state.nextId++}`, ...args.data };
        state.ledgerEntries.push(entry);
        return entry;
      }),
    },
  },
}));

import { recordPayout, recordPaymentSuccess, recordRefund } from "@/app/lib/ledger";

beforeEach(() => {
  state.ledgerEntries = [];
  state.nextId = 0;
});

describe("recordPaymentSuccess", () => {
  it("appends exactly one LedgerEntry row for the payment", async () => {
    const entry = await recordPaymentSuccess({
      tenantId: "tenant-1",
      paymentId: "payment-1",
      bookingId: "booking-1",
      amountCents: 5000,
      currency: "NGN",
      sourceRef: "payment-1",
    });

    expect(state.ledgerEntries).toHaveLength(1);
    expect(entry).toMatchObject({
      tenantId: "tenant-1",
      bookingId: "booking-1",
      paymentId: "payment-1",
      type: "payment_success",
      amountCents: 5000,
      currency: "NGN",
      sourceRef: "payment-1",
    });
  });
});

describe("recordRefund", () => {
  it("appends exactly one LedgerEntry row for the refund", async () => {
    const entry = await recordRefund({
      tenantId: "tenant-1",
      paymentId: "payment-1",
      bookingId: "booking-1",
      amountCents: 5000,
      currency: "NGN",
      sourceRef: "refund-ref-1",
      notes: "Client cancelled within the refund window",
    });

    expect(state.ledgerEntries).toHaveLength(1);
    expect(entry).toMatchObject({
      tenantId: "tenant-1",
      bookingId: "booking-1",
      paymentId: "payment-1",
      type: "refund",
      amountCents: 5000,
      currency: "NGN",
      sourceRef: "refund-ref-1",
      notes: "Client cancelled within the refund window",
    });
  });
});

describe("recordPayout", () => {
  it("appends exactly one LedgerEntry row for the payout with no booking/payment link", async () => {
    const entry = await recordPayout({
      tenantId: "tenant-1",
      amountCents: 120_000,
      currency: "NGN",
      sourceRef: "payout-ref-1",
    });

    expect(state.ledgerEntries).toHaveLength(1);
    expect(entry).toMatchObject({
      tenantId: "tenant-1",
      bookingId: null,
      paymentId: null,
      type: "payout",
      amountCents: 120_000,
      currency: "NGN",
      sourceRef: "payout-ref-1",
    });
  });
});

describe("independent appends", () => {
  it("does not update any pre-existing ledger row when appending a new one", async () => {
    const first = await recordPaymentSuccess({
      tenantId: "tenant-1",
      paymentId: "payment-1",
      amountCents: 5000,
      currency: "NGN",
      sourceRef: "payment-1",
    });

    await recordRefund({
      tenantId: "tenant-1",
      paymentId: "payment-1",
      amountCents: 5000,
      currency: "NGN",
      sourceRef: "refund-ref-1",
    });

    expect(state.ledgerEntries).toHaveLength(2);
    expect(state.ledgerEntries[0]).toEqual(first);
  });
});
