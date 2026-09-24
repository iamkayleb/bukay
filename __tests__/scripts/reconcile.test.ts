import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  aggregateLedgerTotals,
  loadProviderStatement,
  reconcile,
  type LedgerEntryForReconciliation,
} from "@/scripts/reconcile";

const FIXTURES_DIR = join(process.cwd(), "__tests__", "fixtures", "ledger");

function loadLedgerFixture(name: string): LedgerEntryForReconciliation[] {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

describe("aggregateLedgerTotals", () => {
  it("sums amountCents by (type, currency) and counts rows per dimension", () => {
    const totals = aggregateLedgerTotals(loadLedgerFixture("ledger-entries.json"));

    expect(totals).toEqual([
      { type: "payment_success", currency: "NGN", totalAmountCents: 750000, count: 2 },
      { type: "payout", currency: "NGN", totalAmountCents: 400000, count: 1 },
      { type: "refund", currency: "NGN", totalAmountCents: 30000, count: 1 },
    ]);
  });
});

describe("loadProviderStatement", () => {
  it("parses a valid statement fixture", () => {
    const statement = loadProviderStatement(join(FIXTURES_DIR, "provider-statement.json"));
    expect(statement).toHaveLength(3);
  });

  it("throws when an entry is missing a required field", () => {
    expect(() =>
      loadProviderStatement(join(FIXTURES_DIR, "provider-statement-invalid.json"))
    ).toThrow(/missing type\/currency\/totalAmountCents/);
  });
});

describe("reconcile", () => {
  it("matches representative ledger and provider statement fixtures", () => {
    const ledgerEntries = loadLedgerFixture("ledger-entries.json");
    const providerStatement = loadProviderStatement(join(FIXTURES_DIR, "provider-statement.json"));

    const result = reconcile(ledgerEntries, providerStatement);

    expect(result.matched).toBe(true);
    expect(result.lines).toHaveLength(3);
    expect(result.lines.every((line) => line.matched && line.differenceCents === 0)).toBe(true);
  });

  it("flags a mismatched dimension without matching the whole run", () => {
    const ledgerEntries = loadLedgerFixture("ledger-entries.json");
    const providerStatement = loadProviderStatement(
      join(FIXTURES_DIR, "provider-statement-mismatch.json")
    );

    const result = reconcile(ledgerEntries, providerStatement);

    expect(result.matched).toBe(false);
    const paymentLine = result.lines.find((line) => line.type === "payment_success");
    expect(paymentLine?.matched).toBe(false);
    expect(paymentLine?.differenceCents).toBe(50000);

    const refundLine = result.lines.find((line) => line.type === "refund");
    expect(refundLine?.matched).toBe(true);
  });

  it("treats a dimension present only on one side as a mismatch against an implicit zero", () => {
    const result = reconcile([{ type: "payout", currency: "NGN", amountCents: 1000 }], []);

    expect(result.matched).toBe(false);
    expect(result.lines).toEqual([
      {
        type: "payout",
        currency: "NGN",
        ledgerTotalCents: 1000,
        providerTotalCents: 0,
        differenceCents: 1000,
        matched: false,
      },
    ]);
  });

  it("matches trivially when both sides are empty", () => {
    expect(reconcile([], [])).toEqual({ matched: true, lines: [] });
  });
});
