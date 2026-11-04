import { listDeadLetters, type DeadLetterRow } from "./data";

export const dynamic = "force-dynamic";

function formatWhen(value: Date): string {
  return value
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

function renderRows(rows: DeadLetterRow[]) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
        <p className="text-sm text-slate-400">No dead-letter messages.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
        <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Tenant</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {rows.map((row) => (
            <tr key={row.id} className="align-top text-slate-200">
              <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                {formatWhen(row.createdAt)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.source}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.eventType}</td>
              <td className="max-w-md px-3 py-2 text-slate-300">{row.reason ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.tenantId ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminDeadLetterPage() {
  const rows = await listDeadLetters();

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Admin</p>
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">Dead-letter queue</h1>
        <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
          Permanently failed outbound notifications and unhandled inbound webhook events land here
          for inspection.
        </p>
      </div>
      {renderRows(rows)}
    </section>
  );
}
