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
  tenants: [] as { id: string; slug: string }[],
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    ledgerEntry: {
      findMany: vi.fn(
        async (args: {
          where: { tenantId: string; createdAt: { gte: Date; lte: Date } };
          orderBy: { createdAt: "asc" | "desc" };
        }) =>
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
      findUnique: vi.fn(async (args: { where: { slug: string } }) => {
        const tenant = state.tenants.find((t) => t.slug === args.where.slug);
        return tenant ?? null;
      }),
    },
  },
}));

import {
  defaultDateRangeInputs,
  ledgerEntriesToCsv,
  loadLedgerEntriesForRange,
  parseDateRange,
  resolveTenantIdFromHeaders,
} from "@/app/lib/payouts";

function entry(overrides: Partial<LedgerEntryRow> = {}): LedgerEntryRow {
  return {
    id: "ledger-1",
    tenantId: "tenant-1",
    bookingId: null,
    paymentId: null,
    type: "payment_success",
    amountCents: 1000,
    currency: "NGN",
    sourceRef: "src-1",
    notes: null,
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  state.ledgerEntries = [];
  state.tenants = [];
});

describe("parseDateRange", () => {
  it("parses a valid inclusive range", () => {
    const range = parseDateRange("2026-01-01", "2026-01-31");
    expect(range).not.toBeNull();
    expect(range?.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("returns null for missing inputs", () => {
    expect(parseDateRange(null, "2026-01-31")).toBeNull();
    expect(parseDateRange("2026-01-01", undefined)).toBeNull();
  });

  it("returns null for malformed dates", () => {
    expect(parseDateRange("01-01-2026", "2026-01-31")).toBeNull();
  });

  it("returns null when the range is inverted", () => {
    expect(parseDateRange("2026-02-01", "2026-01-01")).toBeNull();
  });

  it("returns null for a calendar-invalid day instead of silently rolling over", () => {
    // Date parses "2026-02-30" by rolling it forward to March 2 rather than
    // throwing; parseDateRange must reject it instead of accepting a caller
    // error and quietly exporting the wrong date range.
    expect(parseDateRange("2026-02-30", "2026-02-30")).toBeNull();
  });

  it("returns null for a calendar-invalid month", () => {
    expect(parseDateRange("2026-13-01", "2026-13-31")).toBeNull();
  });

  it("returns null for a zero day or month", () => {
    expect(parseDateRange("2026-00-01", "2026-01-31")).toBeNull();
    expect(parseDateRange("2026-01-00", "2026-01-31")).toBeNull();
  });
});

describe("defaultDateRangeInputs", () => {
  it("defaults to a trailing 30-day window ending on the given day", () => {
    const range = defaultDateRangeInputs(new Date("2026-01-30T00:00:00.000Z"));
    expect(range).toEqual({ start: "2026-01-01", end: "2026-01-30" });
  });
});

describe("loadLedgerEntriesForRange", () => {
  it("returns only entries for the tenant within the date range, ordered ascending", async () => {
    state.ledgerEntries = [
      entry({ id: "a", createdAt: new Date("2026-01-10T00:00:00.000Z") }),
      entry({ id: "b", createdAt: new Date("2026-01-05T00:00:00.000Z") }),
      entry({ id: "c", tenantId: "tenant-2", createdAt: new Date("2026-01-06T00:00:00.000Z") }),
      entry({ id: "d", createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ];

    const range = parseDateRange("2026-01-01", "2026-01-31")!;
    const result = await loadLedgerEntriesForRange("tenant-1", range);

    expect(result.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("ledgerEntriesToCsv", () => {
  it("renders a header row plus one row per entry", () => {
    const csv = ledgerEntriesToCsv([
      entry({ id: "ledger-1", bookingId: "booking-1", paymentId: "payment-1" }),
    ]);

    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,type,amountCents,currency,sourceRef,bookingId,paymentId,createdAt");
    expect(lines[1]).toBe(
      "ledger-1,payment_success,1000,NGN,src-1,booking-1,payment-1,2026-01-15T12:00:00.000Z"
    );
  });

  it("renders only the header row when there are no entries", () => {
    const csv = ledgerEntriesToCsv([]);
    expect(csv).toBe("id,type,amountCents,currency,sourceRef,bookingId,paymentId,createdAt\n");
  });

  it("quotes fields containing commas", () => {
    const csv = ledgerEntriesToCsv([entry({ sourceRef: "ref,with,commas" })]);
    expect(csv).toContain('"ref,with,commas"');
  });

  it.each(["=cmd|'/bin/calc'!A1", "+1+1", "-1+1", "@SUM(1,1)", "\t=1+1"])(
    "defuses formula-injection payloads in exported fields (%s)",
    (payload) => {
      const csv = ledgerEntriesToCsv([entry({ sourceRef: payload })]);
      const dataLine = csv.trim().split("\n")[1];

      // A spreadsheet app must render this as literal text, not evaluate it
      // as a formula: the exported field has to start with an apostrophe
      // (optionally after an opening quote for CSV-special characters).
      expect(dataLine).toMatch(/,"?'/);
    }
  );

  it("defuses formulas in every caller-controlled text column", () => {
    const csv = ledgerEntriesToCsv([
      entry({
        id: "=ledger-id",
        type: "+payment_success",
        currency: "-NGN",
        sourceRef: "@source-ref",
        bookingId: "\tbooking-id",
        paymentId: "\rpayment-id",
      }),
    ]);

    expect(csv.trim().split("\n")[1]).toBe(
      "'=ledger-id,'+payment_success,1000,'-NGN,'@source-ref,'\tbooking-id,'\rpayment-id,2026-01-15T12:00:00.000Z"
    );
  });

  it("does not alter fields that don't start with a formula-trigger character", () => {
    const csv = ledgerEntriesToCsv([entry({ sourceRef: "normal-ref-123" })]);
    expect(csv).toContain("normal-ref-123");
    expect(csv).not.toContain("'normal-ref-123");
  });
});

describe("resolveTenantIdFromHeaders", () => {
  it("uses the x-tenant-id header when present", async () => {
    const headerGet = (name: string) => (name === "x-tenant-id" ? "tenant-1" : null);
    await expect(resolveTenantIdFromHeaders(headerGet)).resolves.toBe("tenant-1");
  });

  it("resolves a tenant by subdomain when no header is present", async () => {
    state.tenants = [{ id: "tenant-1", slug: "acme" }];
    const headerGet = (name: string) => (name === "host" ? "acme.example.com" : null);
    await expect(resolveTenantIdFromHeaders(headerGet)).resolves.toBe("tenant-1");
  });

  it("returns null when the tenant cannot be resolved", async () => {
    const headerGet = () => null;
    await expect(resolveTenantIdFromHeaders(headerGet)).resolves.toBeNull();
  });
});
