import { describe, expect, it } from "vitest";

import { parseStatement, reconcileEntries } from "../../scripts/reconcile";

const payment = {
  providerRef: "charge-1",
  direction: "credit",
  currency: "NGN",
  grossKobo: 10_000,
  providerFeeKobo: 150,
  netKobo: 9_850,
};

describe("reconcileEntries", () => {
  it("matches each provider reference and totals without rounding kobo", () => {
    expect(reconcileEntries([payment], [{ ...payment }])).toEqual({
      matched: true,
      statementTotals: { grossKobo: 10_000, providerFeeKobo: 150, netKobo: 9_850 },
      ledgerTotals: { grossKobo: 10_000, providerFeeKobo: 150, netKobo: 9_850 },
      discrepancies: [],
    });
  });

  it("reports both a one-kobo mismatch and a provider reference absent from the ledger", () => {
    const report = reconcileEntries(
      [payment, { ...payment, providerRef: "charge-2", grossKobo: 1 }],
      [{ ...payment, netKobo: 9_849 }],
    );

    expect(report.matched).toBe(false);
    expect(report.discrepancies).toEqual([
      { providerRef: "charge-1", reason: "amount-mismatch", fields: ["netKobo"] },
      { providerRef: "charge-2", reason: "missing-ledger-entry" },
    ]);
    expect(report.statementTotals.grossKobo).toBe(10_001);
    expect(report.ledgerTotals.netKobo).toBe(9_849);
  });
});

describe("parseStatement", () => {
  it("requires integer kobo amounts and a provider", () => {
    expect(() => parseStatement({ provider: "paystack", entries: [{ ...payment, netKobo: 98.5 }] })).toThrow(
      "statement.entries",
    );
    expect(() => parseStatement({ entries: [] })).toThrow("statement.provider is required");
  });
});
