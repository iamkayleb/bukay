import { formatPrice } from "../services/services-list";

export type TodaySummaryFigures = {
  bookingsCount: number;
  moneyTakenCents: number;
  unpaidCount: number;
  currency: string;
};

export function TodaySummaryPanel({ summary }: { summary: TodaySummaryFigures }) {
  const { bookingsCount, moneyTakenCents, unpaidCount, currency } = summary;

  return (
    <dl className="grid gap-3 sm:grid-cols-3" aria-label="Today summary">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-4">
        <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Bookings today
        </dt>
        <dd className="mt-2 text-2xl font-semibold tabular-nums text-white">{bookingsCount}</dd>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-4">
        <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Money taken today
        </dt>
        <dd className="mt-2 text-2xl font-semibold tabular-nums text-white">
          {formatPrice(moneyTakenCents, currency)}
        </dd>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-4">
        <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Unpaid today
        </dt>
        <dd className="mt-2 text-2xl font-semibold tabular-nums text-white">{unpaidCount}</dd>
      </div>
    </dl>
  );
}