"use client";

import { FormEvent, useState } from "react";

import { DAY_NAMES, fillWeek, type BusinessHourRow } from "@/app/lib/business-hours";

type BusinessHoursFormProps = {
  /** Stored rows; any day without a row is shown as closed. */
  initialHours: BusinessHourRow[];
};

export type SaveBusinessHoursResult =
  { ok: true; hours: BusinessHourRow[] } | { ok: false; error: string };

/** Display order Monday→Sunday; storage stays 0 = Sunday. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export async function saveBusinessHours(
  hours: BusinessHourRow[]
): Promise<SaveBusinessHoursResult> {
  let response: Response;
  try {
    response = await fetch("/api/business-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ hours }),
    });
  } catch {
    return { ok: false, error: "Unable to save business hours" };
  }

  let data: {
    ok?: boolean;
    error?: string;
    hours?: BusinessHourRow[];
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: "Unable to save business hours" };
  }

  if (!response.ok || !data.ok || !data.hours) {
    if (response.status === 422) {
      return {
        ok: false,
        error: "Each open day needs HH:MM times with opening before closing.",
      };
    }
    return { ok: false, error: data.error ?? "Unable to save business hours" };
  }

  return { ok: true, hours: fillWeek(data.hours) };
}

export function BusinessHoursForm({ initialHours }: BusinessHoursFormProps) {
  const [hours, setHours] = useState<BusinessHourRow[]>(() => fillWeek(initialHours));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (dayOfWeek: number, patch: Partial<BusinessHourRow>) => {
    setSaved(false);
    setHours((current) =>
      current.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row))
    );
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const invalid = hours.find((row) => !row.isClosed && row.opensAt >= row.closesAt);
    if (invalid) {
      setError(`${DAY_NAMES[invalid.dayOfWeek]}: opening time must be before closing time.`);
      return;
    }

    setPending(true);
    const result = await saveBusinessHours(hours);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setHours(result.hours);
    setSaved(true);
  };

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-6"
      onSubmit={onSubmit}
    >
      <div className="space-y-1">
        <h3 className="text-base font-medium text-white">Business hours</h3>
        <p className="text-sm text-slate-400">
          When clients can book. Closed days offer no slots on the public booking page.
        </p>
      </div>

      <div className="divide-y divide-slate-800">
        {DISPLAY_ORDER.map((dayOfWeek) => {
          const row = hours.find((entry) => entry.dayOfWeek === dayOfWeek)!;
          const name = DAY_NAMES[dayOfWeek];
          return (
            <div
              className="flex flex-wrap items-center gap-3 py-3"
              data-day-of-week={dayOfWeek}
              key={dayOfWeek}
            >
              <span className="w-24 text-sm font-medium text-slate-200">{name}</span>
              <input
                aria-label={`${name} opens at`}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white disabled:opacity-40"
                disabled={row.isClosed || pending}
                onChange={(event) => update(dayOfWeek, { opensAt: event.target.value })}
                type="time"
                value={row.opensAt}
              />
              <span className="text-sm text-slate-500">to</span>
              <input
                aria-label={`${name} closes at`}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white disabled:opacity-40"
                disabled={row.isClosed || pending}
                onChange={(event) => update(dayOfWeek, { closesAt: event.target.value })}
                type="time"
                value={row.closesAt}
              />
              <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  aria-label={`${name} closed`}
                  checked={row.isClosed}
                  className="h-4 w-4 accent-emerald-400"
                  disabled={pending}
                  onChange={(event) => update(dayOfWeek, { isClosed: event.target.checked })}
                  type="checkbox"
                />
                Closed
              </label>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : "Save business hours"}
        </button>
        {saved ? <p className="text-sm text-emerald-300">Saved.</p> : null}
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      </div>
    </form>
  );
}
