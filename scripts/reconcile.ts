import { readFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

export type ReconciliationEntry = {
  providerRef: string;
  direction: string;
  currency: string;
  grossKobo: number;
  providerFeeKobo: number;
  netKobo: number;
};

export type ProviderStatement = {
  provider: string;
  tenantId?: string;
  entries: ReconciliationEntry[];
};

export type ReconciliationDiscrepancy = {
  providerRef: string;
  reason: "missing-ledger-entry" | "unexpected-ledger-entry" | "amount-mismatch";
  fields?: Array<"direction" | "currency" | "grossKobo" | "providerFeeKobo" | "netKobo">;
};

export type ReconciliationReport = {
  matched: boolean;
  statementTotals: ReconciliationTotals;
  ledgerTotals: ReconciliationTotals;
  discrepancies: ReconciliationDiscrepancy[];
};

export type ReconciliationTotals = Pick<
  ReconciliationEntry,
  "grossKobo" | "providerFeeKobo" | "netKobo"
>;

const MONEY_FIELDS = ["grossKobo", "providerFeeKobo", "netKobo"] as const;
const MATCHED_FIELDS = ["direction", "currency", ...MONEY_FIELDS] as const;

function totals(entries: ReconciliationEntry[]): ReconciliationTotals {
  return entries.reduce(
    (result, entry) => ({
      grossKobo: result.grossKobo + entry.grossKobo,
      providerFeeKobo: result.providerFeeKobo + entry.providerFeeKobo,
      netKobo: result.netKobo + entry.netKobo,
    }),
    { grossKobo: 0, providerFeeKobo: 0, netKobo: 0 }
  );
}

function entryMap(
  entries: ReconciliationEntry[],
  source: string
): Map<string, ReconciliationEntry> {
  const result = new Map<string, ReconciliationEntry>();
  for (const entry of entries) {
    if (!entry.providerRef.trim()) {
      throw new Error(`${source} entries must include providerRef`);
    }
    if (result.has(entry.providerRef)) {
      throw new Error(`${source} contains duplicate providerRef ${entry.providerRef}`);
    }
    result.set(entry.providerRef, entry);
  }
  return result;
}

/**
 * Compares a provider statement with immutable ledger entries without rounding
 * money values. A result is matched only when every provider reference and all
 * kobo fields agree.
 */
export function reconcileEntries(
  statementEntries: ReconciliationEntry[],
  ledgerEntries: ReconciliationEntry[]
): ReconciliationReport {
  const statementByReference = entryMap(statementEntries, "statement");
  const ledgerByReference = entryMap(ledgerEntries, "ledger");
  const discrepancies: ReconciliationDiscrepancy[] = [];

  for (const [providerRef, statementEntry] of statementByReference) {
    const ledgerEntry = ledgerByReference.get(providerRef);
    if (!ledgerEntry) {
      discrepancies.push({ providerRef, reason: "missing-ledger-entry" });
      continue;
    }

    const fields = MATCHED_FIELDS.filter((field) => statementEntry[field] !== ledgerEntry[field]);
    if (fields.length > 0) {
      discrepancies.push({ providerRef, reason: "amount-mismatch", fields });
    }
  }

  for (const providerRef of ledgerByReference.keys()) {
    if (!statementByReference.has(providerRef)) {
      discrepancies.push({ providerRef, reason: "unexpected-ledger-entry" });
    }
  }

  const statementTotals = totals(statementEntries);
  const ledgerTotals = totals(ledgerEntries);
  const totalsMatch = MONEY_FIELDS.every((field) => statementTotals[field] === ledgerTotals[field]);
  return {
    matched: totalsMatch && discrepancies.length === 0,
    statementTotals,
    ledgerTotals,
    discrepancies,
  };
}

function isReconciliationEntry(value: unknown): value is ReconciliationEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.providerRef === "string" &&
    typeof entry.direction === "string" &&
    typeof entry.currency === "string" &&
    MONEY_FIELDS.every((field) => Number.isSafeInteger(entry[field]))
  );
}

export function parseStatement(value: unknown): ProviderStatement {
  if (!value || typeof value !== "object") throw new Error("statement must be a JSON object");
  const statement = value as Record<string, unknown>;
  if (typeof statement.provider !== "string" || !statement.provider.trim()) {
    throw new Error("statement.provider is required");
  }
  if (statement.tenantId !== undefined && typeof statement.tenantId !== "string") {
    throw new Error("statement.tenantId must be a string when supplied");
  }
  if (!Array.isArray(statement.entries) || !statement.entries.every(isReconciliationEntry)) {
    throw new Error("statement.entries must contain kobo-valued reconciliation entries");
  }
  return { provider: statement.provider, tenantId: statement.tenantId, entries: statement.entries };
}

function parseArguments(argv: string[]): { statementPath: string; from?: Date; to?: Date } {
  let statementPath: string | undefined;
  let from: Date | undefined;
  let to: Date | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!value || !option) throw new Error(`missing value for ${option}`);
    if (option === "--statement") statementPath = value;
    else if (option === "--from") from = new Date(value);
    else if (option === "--to") to = new Date(value);
    else throw new Error(`unknown option ${option}`);
    index += 1;
  }
  if (!statementPath)
    throw new Error(
      "usage: tsx scripts/reconcile.ts --statement statement.json [--from ISO-8601] [--to ISO-8601]"
    );
  if ((from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf()))) {
    throw new Error("--from and --to must be ISO-8601 dates");
  }
  if (from && to && from > to) throw new Error("--from must be before --to");
  return { statementPath, from, to };
}

export async function runReconciliation(
  argv: string[],
  client = new PrismaClient()
): Promise<ReconciliationReport> {
  const { statementPath, from, to } = parseArguments(argv);
  const statement = parseStatement(JSON.parse(await readFile(statementPath, "utf8")));
  const entries = await client.ledgerEntry.findMany({
    where: {
      provider: statement.provider,
      ...(statement.tenantId ? { tenantId: statement.tenantId } : {}),
      ...(from || to
        ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    select: {
      id: true,
      providerRef: true,
      direction: true,
      currency: true,
      grossKobo: true,
      providerFeeKobo: true,
      netKobo: true,
    },
  });
  return reconcileEntries(
    statement.entries,
    entries.map(({ id, providerRef, ...entry }) => ({
      ...entry,
      // A provider row without a reference is itself an unexpected, unreconciled
      // entry; do not silently exclude it from the report.
      providerRef: providerRef ?? `ledger:${id}`,
    }))
  );
}

async function main(): Promise<void> {
  const client = new PrismaClient();
  try {
    const report = await runReconciliation(process.argv.slice(2), client);
    console.log(JSON.stringify(report, null, 2));
    if (!report.matched) process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith("reconcile.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
