"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

// Owner-facing editor for the tenant's weekly schedule. Each weekday holds
// zero or more open→close windows so operators can express split shifts
// (e.g. 09:00–12:00 and 14:00–18:00 on the same day). The full week is
// submitted as one PUT payload, matching the API contract.

type ScheduleWindow = {
  opensAt: string;
  closesAt: string;
};

type ScheduleDays = Record<string, ScheduleWindow[]>;

type ApiValidationError = {
  ok: false;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};

const DAY_LABELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "0", label: "Sunday" },
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
];

const TIME_PATTERN = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

function emptyDays(): ScheduleDays {
  return {
    "0": [],
    "1": [],
    "2": [],
    "3": [],
    "4": [],
    "5": [],
    "6": [],
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export function validateWindow(win: ScheduleWindow): string | null {
  if (!TIME_PATTERN.test(win.opensAt)) return "opensAt must be HH:mm";
  if (!TIME_PATTERN.test(win.closesAt)) return "closesAt must be HH:mm";
  if (toMinutes(win.opensAt) >= toMinutes(win.closesAt)) {
    return "closesAt must be after opensAt";
  }
  return null;
}

export function validateSchedule(days: ScheduleDays): string | null {
  for (const { key, label } of DAY_LABELS) {
    const windows = days[key] ?? [];
    for (const win of windows) {
      const err = validateWindow(win);
      if (err) return `${label}: ${err}`;
    }
  }
  return null;
}

export function OwnerScheduleEditor() {
  const [days, setDays] = useState<ScheduleDays>(emptyDays);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSchedule = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/schedule", {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to load schedule");
      }
      const loaded = { ...emptyDays(), ...(data.days as ScheduleDays) };
      setDays(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load schedule");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  function addWindow(dayKey: string) {
    setDays((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] ?? []), { opensAt: "09:00", closesAt: "17:00" }],
    }));
  }

  function removeWindow(dayKey: string, index: number) {
    setDays((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] ?? []).filter((_, i) => i !== index),
    }));
  }

  function updateWindow(dayKey: string, index: number, patch: Partial<ScheduleWindow>) {
    setDays((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] ?? []).map((win, i) => (i === index ? { ...win, ...patch } : win)),
    }));
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const validationError = validateSchedule(days);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (data.error === "validation_failed") {
          const apiErr = data as ApiValidationError;
          const first = apiErr.formErrors?.[0] ?? apiErr.error ?? "Validation failed";
          throw new Error(first);
        }
        throw new Error(data.error ?? "Unable to save schedule");
      }
      setDays({ ...emptyDays(), ...(data.days as ScheduleDays) });
      setNotice("Schedule saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save schedule");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="rounded-lg border border-slate-800 bg-slate-900 p-5"
      onSubmit={(event) => void saveSchedule(event)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Weekly schedule</h2>
          <p className="mt-1 text-sm text-slate-400">
            Add one or more open/close windows for each weekday. Days with no windows are treated
            as closed.
          </p>
        </div>
        <button
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving || isLoading}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save schedule"}
        </button>
      </div>

      {notice ? (
        <p className="mt-4 rounded-md border border-emerald-900/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading schedule...</p>
        ) : (
          DAY_LABELS.map(({ key, label }) => {
            const windows = days[key] ?? [];
            return (
              <div key={key} className="rounded-md border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <button
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400"
                    onClick={() => addWindow(key)}
                    type="button"
                  >
                    Add window
                  </button>
                </div>

                {windows.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">Closed all day.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {windows.map((win, index) => (
                      <li
                        className="grid grid-cols-[1fr_1fr_auto] items-center gap-3"
                        key={`${key}-${index}`}
                      >
                        <label className="text-xs text-slate-300">
                          <span className="mb-1 block">Opens</span>
                          <input
                            aria-label={`${label} window ${index + 1} opens at`}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
                            onChange={(event) =>
                              updateWindow(key, index, { opensAt: event.target.value })
                            }
                            type="time"
                            value={win.opensAt}
                          />
                        </label>
                        <label className="text-xs text-slate-300">
                          <span className="mb-1 block">Closes</span>
                          <input
                            aria-label={`${label} window ${index + 1} closes at`}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400"
                            onChange={(event) =>
                              updateWindow(key, index, { closesAt: event.target.value })
                            }
                            type="time"
                            value={win.closesAt}
                          />
                        </label>
                        <button
                          className="mt-4 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-red-400"
                          onClick={() => removeWindow(key, index)}
                          type="button"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </form>
  );
}
