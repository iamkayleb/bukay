import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import type { LedgerEntryRow } from "@/app/lib/ledger";

const ledgerEntryDelegate = (
  prisma as unknown as {
    ledgerEntry: {
      findMany(args: unknown): Promise<LedgerEntryRow[]>;
    };
  }
).ledgerEntry;

export type PayoutsDateRangeInputs = {
  start: string;
  end: string;
};

export type PayoutsDateRange = {
  start: Date;
  end: Date;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Defaults the dashboard's date inputs to the trailing 30 days (inclusive). */
export function defaultDateRangeInputs(now: Date = new Date()): PayoutsDateRangeInputs {
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  const start = startDate.toISOString().slice(0, 10);
  return { start, end };
}

/**
 * Parses `start`/`end` date-only inputs (YYYY-MM-DD) into an inclusive
 * UTC range. Returns null when either input is missing, malformed, or the
 * range is inverted, so callers can surface a single validation error.
 */
export function parseDateRange(
  startInput: string | null | undefined,
  endInput: string | null | undefined
): PayoutsDateRange | null {
  if (!startInput || !endInput || !DATE_ONLY.test(startInput) || !DATE_ONLY.test(endInput)) {
    return null;
  }

  const start = new Date(`${startInput}T00:00:00.000Z`);
  const end = new Date(`${endInput}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null;
  }

  return { start, end };
}

export async function loadLedgerEntriesForRange(
  tenantId: string,
  range: PayoutsDateRange
): Promise<LedgerEntryRow[]> {
  return ledgerEntryDelegate.findMany({
    where: { tenantId, createdAt: { gte: range.start, lte: range.end } },
    orderBy: { createdAt: "asc" },
  });
}

const CSV_COLUMNS = [
  "id",
  "type",
  "amountCents",
  "currency",
  "sourceRef",
  "bookingId",
  "paymentId",
  "createdAt",
] as const;

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serializes ledger entries to CSV with a header row, even when empty. */
export function ledgerEntriesToCsv(entries: LedgerEntryRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const entry of entries) {
    lines.push(
      [
        entry.id,
        entry.type,
        String(entry.amountCents),
        entry.currency,
        entry.sourceRef,
        entry.bookingId ?? "",
        entry.paymentId ?? "",
        entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
      ]
        .map(csvField)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Resolves a tenantId from request headers the same way the API layer's
 * runForTenant does (x-tenant-id header, or subdomain resolved through the
 * Tenant table), but returns a plain string|null since server components
 * can't short-circuit with a NextResponse.
 */
export async function resolveTenantIdFromHeaders(
  headerGet: (name: string) => string | null
): Promise<string | null> {
  const resolved = resolveTenant({ headers: { get: headerGet } });

  if (resolved.tenantId?.trim()) {
    return resolved.tenantId.trim();
  }

  if (resolved.tenantSlug?.trim()) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });
    return tenant?.id ?? null;
  }

  return null;
}
