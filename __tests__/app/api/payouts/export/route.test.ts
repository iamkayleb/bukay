import { NextRequest } from "next/server";
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
  ledgerEntries: [] as LedgerEntryRow[],
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

import { GET } from "@/app/api/payouts/export/route";

function request(query: string, headers: Record<string, string> = { "x-tenant-id": "tenant-1" }) {
  return new NextRequest(`http://app.test/api/payouts/export${query}`, { headers });
}

beforeEach(() => {
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

describe("GET /api/payouts/export", () => {
  it("returns 200 with CSV content for a valid date range", async () => {
    const response = await GET(request("?start=2026-01-01&end=2026-01-31"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");

    const body = await response.text();
    const lines = body.trim().split("\n");
    expect(lines[0]).toBe("id,type,amountCents,currency,sourceRef,bookingId,paymentId,createdAt");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("ledger-1");
    expect(lines[1]).toContain("payment_success");
  });

  it("returns 400 for a missing date range", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_date_range" });
  });

  it("returns 400 for an inverted date range", async () => {
    const response = await GET(request("?start=2026-02-01&end=2026-01-01"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for a calendar-invalid date instead of silently rolling over", async () => {
    const response = await GET(request("?start=2026-02-30&end=2026-02-30"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_date_range" });
  });

  it("rejects February 29 in a non-leap year", async () => {
    const response = await GET(request("?start=2026-02-29&end=2026-02-29"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_date_range" });
  });

  it("returns 400 for a malformed date format", async () => {
    const response = await GET(request("?start=01/01/2026&end=2026-01-31"));
    expect(response.status).toBe(400);
  });

  it("scopes exported rows to the resolved tenant", async () => {
    const response = await GET(
      request("?start=2026-01-01&end=2026-01-31", { "x-tenant-id": "other-tenant" })
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body.trim().split("\n")).toHaveLength(1);
  });
});
