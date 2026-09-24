import { headers } from "next/headers";

import type { LedgerEntryRow } from "@/app/lib/ledger";
import {
  defaultDateRangeInputs,
  loadLedgerEntriesForRange,
  parseDateRange,
  resolveTenantIdFromHeaders,
} from "@/app/lib/payouts";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const dynamic = "force-dynamic";

type PayoutsPageProps = {
  searchParams: { start?: string; end?: string };
};

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amountCents / 100);
}

export default async function PayoutsPage({ searchParams }: PayoutsPageProps) {
  const defaults = defaultDateRangeInputs();
  const startInput = searchParams.start ?? defaults.start;
  const endInput = searchParams.end ?? defaults.end;
  const range = parseDateRange(startInput, endInput);

  const headerList = headers();
  const tenantId = await resolveTenantIdFromHeaders((name) => headerList.get(name));

  let entries: LedgerEntryRow[] = [];
  if (range && tenantId) {
    entries = await runWithTenantContext({ tenantId }, () =>
      loadLedgerEntriesForRange(tenantId, range)
    );
  }

  const exportHref = `/api/payouts/export?start=${encodeURIComponent(
    startInput
  )}&end=${encodeURIComponent(endInput)}`;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Payouts
        </p>
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">Payouts &amp; ledger</h1>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">
          Review payment, refund, and payout ledger entries for a date range, or export them as CSV
          for reconciliation.
        </p>
      </div>

      <form
        aria-label="Payouts date range"
        className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
        method="GET"
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Start date</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            defaultValue={startInput}
            max={endInput}
            name="start"
            type="date"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-200">End date</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            defaultValue={endInput}
            min={startInput}
            name="end"
            type="date"
          />
        </label>
        <button
          className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
          type="submit"
        >
          Apply
        </button>
        <a
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          href={exportHref}
        >
          Export CSV
        </a>
      </form>

      {!range ? (
        <p className="rounded-md border border-red-900/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          Enter a valid start and end date to view ledger entries.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <div className="grid grid-cols-[1fr_120px_100px_1fr] bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span>Type</span>
            <span>Amount</span>
            <span>Currency</span>
            <span>Source ref</span>
          </div>

          {entries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              No ledger entries in this date range.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {entries.map((entry) => (
                <li
                  className="grid grid-cols-[1fr_120px_100px_1fr] items-center gap-3 px-4 py-3 text-sm"
                  key={entry.id}
                >
                  <span className="text-white">{entry.type}</span>
                  <span className="text-slate-300">
                    {formatAmount(entry.amountCents, entry.currency)}
                  </span>
                  <span className="text-slate-300">{entry.currency}</span>
                  <span className="truncate text-slate-400">{entry.sourceRef}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
