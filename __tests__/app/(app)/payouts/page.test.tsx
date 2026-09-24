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
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  ledgerEntries: [] as LedgerEntryRow[],
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => state.headers.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    ledgerEntry: {
      findMany: vi.fn(
        async (args: { where: { tenantId: string; createdAt: { gte: Date; lte: Date } } }) =>
          state.ledgerEntries
            .filter(
              (entry) =>
                entry.tenantId === args.where.tenantId &&
                entry.createdAt >= args.where.createdAt.gte &&
                entry.createdAt <= args.where.createdAt.lte
            )
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      ),
    },
    tenant: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

import PayoutsPage from "@/app/(app)/payouts/page";

beforeEach(() => {
  state.headers = new Map([["x-tenant-id", "tenant-1"]]);
  state.ledgerEntries = [
    {
      id: "ledger-1",
      tenantId: "tenant-1",
      bookingId: "booking-1",
      paymentId: "payment-1",
      type: "payment_success",
      amountCents: 5000,
      currency: "NGN",
      sourceRef: "payment-1",
      notes: null,
      createdAt: new Date("2026-01-15T12:00:00.000Z"),
    },
  ];
});

describe("PayoutsPage", () => {
  it("renders start/end date controls and an export link scoped to the requested range", async () => {
    const result = await PayoutsPage({ searchParams: { start: "2026-01-01", end: "2026-01-31" } });
    const json = JSON.stringify(result);

    expect(json).toContain('"name":"start"');
    expect(json).toContain('"name":"end"');
    expect(json).toContain('"defaultValue":"2026-01-01"');
    expect(json).toContain('"defaultValue":"2026-01-31"');
    expect(json).toContain("/api/payouts/export?start=2026-01-01&end=2026-01-31");
  });

  it("loads and renders LedgerEntry rows for the requested range from the resolved tenant", async () => {
    const result = await PayoutsPage({ searchParams: { start: "2026-01-01", end: "2026-01-31" } });
    const json = JSON.stringify(result);

    expect(json).toContain("payment_success");
    expect(json).toContain("payment-1");
  });

  it("excludes entries outside the requested range", async () => {
    state.ledgerEntries.push({
      id: "ledger-2",
      tenantId: "tenant-1",
      bookingId: null,
      paymentId: null,
      type: "payout",
      amountCents: 10000,
      currency: "NGN",
      sourceRef: "payout-1",
      notes: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    const result = await PayoutsPage({ searchParams: { start: "2026-01-01", end: "2026-01-31" } });
    const json = JSON.stringify(result);

    expect(json).not.toContain("payout-1");
  });

  it("defaults to a trailing range and still renders an export link when no searchParams are given", async () => {
    const result = await PayoutsPage({ searchParams: {} });
    const json = JSON.stringify(result);

    expect(json).toContain("/api/payouts/export?start=");
    expect(json).toContain("Export CSV");
  });

  it("shows a validation message instead of a table for an inverted date range", async () => {
    const result = await PayoutsPage({ searchParams: { start: "2026-02-01", end: "2026-01-01" } });
    const json = JSON.stringify(result);

    expect(json).toContain("Enter a valid start and end date");
  });
});
