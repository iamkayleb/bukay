// Reconciles the append-only LedgerEntry table against a payment provider's
// settlement statement: sums LedgerEntry.amountCents grouped by (type,
// currency) for a date range, and compares those totals against the
// equivalent totals reported in the provider's statement.
//
// Usage:
//   tsx scripts/reconcile.ts --tenant <tenantId> --start 2026-01-01 \
//     --end 2026-01-31 --statement path/to/statement.json
//
// The statement file is a JSON array of
// { "type": string, "currency": string, "totalAmountCents": number }.
// Exits 0 when every (type, currency) dimension matches, 1 otherwise.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { parseDateRange } from "@/app/lib/payouts";

export type LedgerEntryForReconciliation = {
  type: string;
  currency: string;
  amountCents: number;
};

export type ProviderStatementEntry = {
  type: string;
  currency: string;
  totalAmountCents: number;
};

export type AggregatedTotal = {
  type: string;
  currency: string;
  totalAmountCents: number;
  count: number;
};

export type ReconciliationLine = {
  type: string;
  currency: string;
  ledgerTotalCents: number;
  providerTotalCents: number;
  differenceCents: number;
  matched: boolean;
};

export type ReconciliationResult = {
  matched: boolean;
  lines: ReconciliationLine[];
};

function dimensionKey(type: string, currency: string): string {
  return `${type}:${currency}`;
}

/** Sums amountCents by (type, currency) — the same dimensions used in provider statements. */
export function aggregateLedgerTotals(
  entries: readonly LedgerEntryForReconciliation[]
): AggregatedTotal[] {
  const totals = new Map<string, AggregatedTotal>();

  for (const entry of entries) {
    const key = dimensionKey(entry.type, entry.currency);
    const existing = totals.get(key);
    if (existing) {
      existing.totalAmountCents += entry.amountCents;
      existing.count += 1;
    } else {
      totals.set(key, {
        type: entry.type,
        currency: entry.currency,
        totalAmountCents: entry.amountCents,
        count: 1,
      });
    }
  }

  return [...totals.values()].sort((a, b) =>
    dimensionKey(a.type, a.currency).localeCompare(dimensionKey(b.type, b.currency))
  );
}

/**
 * Compares LedgerEntry totals against a provider statement, dimension by
 * dimension (type + currency). A dimension present on only one side is
 * treated as a mismatch against an implicit zero on the other side, so a
 * missing/extra provider line can't silently pass reconciliation.
 */
export function reconcile(
  ledgerEntries: readonly LedgerEntryForReconciliation[],
  providerStatement: readonly ProviderStatementEntry[]
): ReconciliationResult {
  const ledgerByKey = new Map(
    aggregateLedgerTotals(ledgerEntries).map((total) => [
      dimensionKey(total.type, total.currency),
      total.totalAmountCents,
    ])
  );
  const providerByKey = new Map(
    providerStatement.map((entry) => [
      dimensionKey(entry.type, entry.currency),
      entry.totalAmountCents,
    ])
  );

  const keys = new Set([...ledgerByKey.keys(), ...providerByKey.keys()]);

  const lines: ReconciliationLine[] = [...keys].sort().map((key) => {
    const [type, currency] = key.split(":");
    const ledgerTotalCents = ledgerByKey.get(key) ?? 0;
    const providerTotalCents = providerByKey.get(key) ?? 0;
    const differenceCents = ledgerTotalCents - providerTotalCents;
    return {
      type,
      currency,
      ledgerTotalCents,
      providerTotalCents,
      differenceCents,
      matched: differenceCents === 0,
    };
  });

  return { matched: lines.every((line) => line.matched), lines };
}

export function loadProviderStatement(path: string): ProviderStatementEntry[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Provider statement at ${path} must be a JSON array`);
  }

  return raw.map((entry: unknown, index: number) => {
    const record = entry as Partial<ProviderStatementEntry> | null;
    if (
      typeof record?.type !== "string" ||
      typeof record?.currency !== "string" ||
      typeof record?.totalAmountCents !== "number"
    ) {
      throw new Error(
        `Provider statement entry ${index} is missing type/currency/totalAmountCents`
      );
    }
    return {
      type: record.type,
      currency: record.currency,
      totalAmountCents: record.totalAmountCents,
    };
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      tenant: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      statement: { type: "string" },
    },
  });

  if (!values.tenant || !values.statement) {
    console.error(
      "Usage: tsx scripts/reconcile.ts --tenant <tenantId> --start <YYYY-MM-DD> --end <YYYY-MM-DD> --statement <path>"
    );
    process.exitCode = 1;
    return;
  }

  const range = parseDateRange(values.start, values.end);
  if (!range) {
    console.error("A valid --start and --end (YYYY-MM-DD) date range is required");
    process.exitCode = 1;
    return;
  }

  const providerStatement = loadProviderStatement(values.statement);

  const prisma = new PrismaClient();
  try {
    const entries = await prisma.ledgerEntry.findMany({
      where: { tenantId: values.tenant, createdAt: { gte: range.start, lte: range.end } },
      select: { type: true, currency: true, amountCents: true },
    });

    const result = reconcile(entries, providerStatement);

    for (const line of result.lines) {
      const status = line.matched ? "MATCH" : "MISMATCH";
      console.log(
        `[${status}] ${line.type}/${line.currency}: ledger=${line.ledgerTotalCents} provider=${line.providerTotalCents} diff=${line.differenceCents}`
      );
    }
    console.log(result.matched ? "Reconciliation OK" : "Reconciliation FAILED");

    process.exitCode = result.matched ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
