"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type BusinessHourFormRow = {
  id: string;
  dayOfWeek: string;
  opensAt: string;
  closesAt: string;
};

export type BlackoutFormRow = {
  id: string;
  date: string;
  reason: string;
};

export type AvailabilityFieldErrors = {
  businessHours?: string;
  blackouts?: string;
  _form?: string;
};

type AvailabilityResponse = {
  ok: boolean;
  error?: string;
  businessHours?: Array<{
    id: string;
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
  }>;
  blackouts?: Array<{
    id: string;
    date: string;
    reason?: string | null;
  }>;
};

const weekdays = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const defaultBusinessHour: BusinessHourFormRow = {
  id: "new-hour",
  dayOfWeek: "1",
  opensAt: "09:00",
  closesAt: "18:00",
};

const defaultBlackout: BlackoutFormRow = {
  id: "new-blackout",
  date: "",
  reason: "",
};

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function validateAvailabilityForm(
  businessHours: BusinessHourFormRow[],
  blackouts: BlackoutFormRow[]
): AvailabilityFieldErrors {
  const errors: AvailabilityFieldErrors = {};

  for (const window of businessHours) {
    if (!window.dayOfWeek || !window.opensAt || !window.closesAt) {
      errors.businessHours = "Every business hour needs a weekday, open time, and close time";
      break;
    }

    if (window.opensAt >= window.closesAt) {
      errors.businessHours = "Close time must be after open time";
      break;
    }
  }

  const uniqueWindows = new Set(
    businessHours.map((window) => `${window.dayOfWeek}-${window.opensAt}-${window.closesAt}`)
  );
  if (uniqueWindows.size !== businessHours.length) {
    errors.businessHours = "Duplicate business hour windows are not allowed";
  }

  const filledBlackouts = blackouts.filter((blackout) => blackout.date.trim());
  if (filledBlackouts.length !== blackouts.length) {
    errors.blackouts = "Every blackout needs a date";
  }

  const uniqueBlackouts = new Set(filledBlackouts.map((blackout) => blackout.date));
  if (uniqueBlackouts.size !== filledBlackouts.length) {
    errors.blackouts = "Duplicate blackout dates are not allowed";
  }

  return errors;
}

function buildPayload(businessHours: BusinessHourFormRow[], blackouts: BlackoutFormRow[]) {
  return {
    businessHours: businessHours.map((window) => ({
      dayOfWeek: Number(window.dayOfWeek),
      opensAt: window.opensAt,
      closesAt: window.closesAt,
    })),
    blackouts: blackouts.map((blackout) => ({
      date: blackout.date,
      reason: blackout.reason.trim() || undefined,
    })),
  };
}

function hasErrors(errors: AvailabilityFieldErrors) {
  return Object.keys(errors).length > 0;
}

function weekdayLabel(dayOfWeek: string) {
  return weekdays.find((day) => day.value === dayOfWeek)?.label ?? "Weekday";
}

export function SettingsManager() {
  const [businessHours, setBusinessHours] = useState<BusinessHourFormRow[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutFormRow[]>([]);
  const [errors, setErrors] = useState<AvailabilityFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const groupedHours = useMemo(
    () =>
      weekdays.map((day) => ({
        ...day,
        windows: businessHours.filter((window) => window.dayOfWeek === day.value),
      })),
    [businessHours]
  );

  async function loadAvailability() {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/settings/availability", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as AvailabilityResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to load availability");
      }

      setBusinessHours(
        (data.businessHours ?? []).map((window) => ({
          id: window.id,
          dayOfWeek: String(window.dayOfWeek),
          opensAt: window.opensAt,
          closesAt: window.closesAt,
        }))
      );
      setBlackouts(
        (data.blackouts ?? []).map((blackout) => ({
          id: blackout.id,
          date: blackout.date,
          reason: blackout.reason ?? "",
        }))
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load availability");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAvailability();
  }, []);

  function addBusinessHour(dayOfWeek = "1") {
    setBusinessHours((current) => [
      ...current,
      { ...defaultBusinessHour, id: nextId("hour"), dayOfWeek },
    ]);
  }

  function updateBusinessHour(id: string, patch: Partial<BusinessHourFormRow>) {
    setBusinessHours((current) =>
      current.map((window) => (window.id === id ? { ...window, ...patch } : window))
    );
  }

  function removeBusinessHour(id: string) {
    setBusinessHours((current) => current.filter((window) => window.id !== id));
  }

  function addBlackout() {
    setBlackouts((current) => [...current, { ...defaultBlackout, id: nextId("blackout") }]);
  }

  function updateBlackout(id: string, patch: Partial<BlackoutFormRow>) {
    setBlackouts((current) =>
      current.map((blackout) => (blackout.id === id ? { ...blackout, ...patch } : blackout))
    );
  }

  function removeBlackout(id: string) {
    setBlackouts((current) => current.filter((blackout) => blackout.id !== id));
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const nextErrors = validateAvailabilityForm(businessHours, blackouts);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      const response = await fetch("/api/settings/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload(businessHours, blackouts)),
      });
      const data = (await response.json()) as AvailabilityResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to save availability");
      }

      await loadAvailability();
      setNotice("Availability saved.");
    } catch (error) {
      setErrors({
        _form: error instanceof Error ? error.message : "Unable to save availability",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <form
        className="mx-auto max-w-6xl space-y-6"
        onSubmit={(event) => void saveAvailability(event)}
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              Settings
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Business availability</h1>
          </div>
          <button
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving || isLoading}
            type="submit"
          >
            {isSaving ? "Saving..." : "Save availability"}
          </button>
        </div>

        {notice ? (
          <p className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
            {notice}
          </p>
        ) : null}

        {errors._form ? (
          <p className="rounded-md border border-red-900/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            {errors._form}
          </p>
        ) : null}

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-white">Weekly hours</h2>
              <p className="mt-1 text-sm text-slate-400">
                Add one or more open windows per weekday.
              </p>
            </div>
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
              type="button"
              onClick={() => addBusinessHour()}
            >
              Add window
            </button>
          </div>

          {errors.businessHours ? (
            <p className="mt-4 text-sm text-red-300">{errors.businessHours}</p>
          ) : null}

          {isLoading ? (
            <p className="mt-5 text-sm text-slate-400">Loading weekly hours...</p>
          ) : (
            <div className="mt-5 divide-y divide-slate-800">
              {groupedHours.map((day) => (
                <div className="grid gap-3 py-4 lg:grid-cols-[140px_minmax(0,1fr)]" key={day.value}>
                  <div className="flex items-center justify-between gap-3 lg:block">
                    <p className="text-sm font-semibold text-white">{day.label}</p>
                    <button
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400"
                      type="button"
                      onClick={() => addBusinessHour(day.value)}
                    >
                      Add
                    </button>
                  </div>
                  {day.windows.length === 0 ? (
                    <p className="text-sm text-slate-500">Closed</p>
                  ) : (
                    <div className="grid gap-3">
                      {day.windows.map((window) => (
                        <div
                          className="grid gap-3 sm:grid-cols-[150px_1fr_1fr_auto]"
                          key={window.id}
                        >
                          <select
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                            value={window.dayOfWeek}
                            onChange={(event) =>
                              updateBusinessHour(window.id, { dayOfWeek: event.target.value })
                            }
                          >
                            {weekdays.map((weekday) => (
                              <option key={weekday.value} value={weekday.value}>
                                {weekday.label}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label={`${weekdayLabel(window.dayOfWeek)} open time`}
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                            type="time"
                            value={window.opensAt}
                            onChange={(event) =>
                              updateBusinessHour(window.id, { opensAt: event.target.value })
                            }
                          />
                          <input
                            aria-label={`${weekdayLabel(window.dayOfWeek)} close time`}
                            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                            type="time"
                            value={window.closesAt}
                            onChange={(event) =>
                              updateBusinessHour(window.id, { closesAt: event.target.value })
                            }
                          />
                          <button
                            className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:border-red-400"
                            type="button"
                            onClick={() => removeBusinessHour(window.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-white">Blackout dates</h2>
              <p className="mt-1 text-sm text-slate-400">
                Close the business for holidays or one-off events.
              </p>
            </div>
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
              type="button"
              onClick={addBlackout}
            >
              Add blackout
            </button>
          </div>

          {errors.blackouts ? (
            <p className="mt-4 text-sm text-red-300">{errors.blackouts}</p>
          ) : null}

          {isLoading ? (
            <p className="mt-5 text-sm text-slate-400">Loading blackout dates...</p>
          ) : blackouts.length === 0 ? (
            <p className="mt-5 text-sm text-slate-500">No blackout dates.</p>
          ) : (
            <div className="mt-5 grid gap-3">
              {blackouts.map((blackout) => (
                <div
                  className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
                  key={blackout.id}
                >
                  <input
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                    type="date"
                    value={blackout.date}
                    onChange={(event) => updateBlackout(blackout.id, { date: event.target.value })}
                  />
                  <input
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                    placeholder="Reason"
                    value={blackout.reason}
                    onChange={(event) =>
                      updateBlackout(blackout.id, { reason: event.target.value })
                    }
                  />
                  <button
                    className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:border-red-400"
                    type="button"
                    onClick={() => removeBlackout(blackout.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </form>
    </main>
  );
}
