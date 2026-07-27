"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type BusinessHour = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
};

type Blackout = {
  date: string;
  reason: string;
};

type ScheduleResponse = {
  ok: boolean;
  error?: string;
  businessHours?: BusinessHour[];
  blackouts?: Blackout[];
};

const weekdays = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const defaultBusinessHours: BusinessHour[] = [
  { dayOfWeek: 1, opensAt: "09:00", closesAt: "18:00" },
  { dayOfWeek: 2, opensAt: "09:00", closesAt: "18:00" },
  { dayOfWeek: 3, opensAt: "09:00", closesAt: "18:00" },
  { dayOfWeek: 4, opensAt: "09:00", closesAt: "18:00" },
  { dayOfWeek: 5, opensAt: "09:00", closesAt: "18:00" },
];

function emptyBlackout(): Blackout {
  return { date: "", reason: "" };
}

export function ScheduleSettings() {
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>(defaultBusinessHours);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadSchedule() {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/settings/schedule", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as ScheduleResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to load schedule");
      }

      setBusinessHours(data.businessHours ?? []);
      setBlackouts(data.blackouts ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load schedule");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSchedule();
  }, []);

  const groupedHours = useMemo(
    () =>
      weekdays.map((day) => ({
        ...day,
        windows: businessHours.filter((hour) => hour.dayOfWeek === day.value),
      })),
    [businessHours]
  );

  function addWindow(dayOfWeek: number) {
    setBusinessHours((current) => [...current, { dayOfWeek, opensAt: "09:00", closesAt: "17:00" }]);
  }

  function updateWindow(index: number, patch: Partial<BusinessHour>) {
    setBusinessHours((current) =>
      current.map((hour, currentIndex) => (currentIndex === index ? { ...hour, ...patch } : hour))
    );
  }

  function removeWindow(index: number) {
    setBusinessHours((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function updateBlackout(index: number, patch: Partial<Blackout>) {
    setBlackouts((current) =>
      current.map((blackout, currentIndex) =>
        currentIndex === index ? { ...blackout, ...patch } : blackout
      )
    );
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/settings/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          businessHours,
          blackouts: blackouts.filter((blackout) => blackout.date.trim()),
        }),
      });
      const data = (await response.json()) as ScheduleResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to save schedule");
      }

      await loadSchedule();
      setNotice("Schedule saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save schedule");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <form className="mx-auto max-w-6xl space-y-6" onSubmit={(event) => void saveSchedule(event)}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              Settings
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Business schedule</h1>
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
          <p className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
            {notice}
          </p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {groupedHours.map((day) => (
              <div
                className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
                key={day.value}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-white">{day.label}</h2>
                  <button
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400"
                    type="button"
                    onClick={() => addWindow(day.value)}
                  >
                    Add window
                  </button>
                </div>

                {day.windows.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Closed</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {businessHours.map((hour, index) =>
                      hour.dayOfWeek === day.value ? (
                        <div
                          className="grid grid-cols-[1fr_1fr_auto] items-end gap-3"
                          key={`${hour.dayOfWeek}-${index}`}
                        >
                          <label className="block">
                            <span className="text-xs font-medium text-slate-400">Opens</span>
                            <input
                              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                              required
                              type="time"
                              value={hour.opensAt}
                              onChange={(event) =>
                                updateWindow(index, { opensAt: event.target.value })
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-slate-400">Closes</span>
                            <input
                              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                              required
                              type="time"
                              value={hour.closesAt}
                              onChange={(event) =>
                                updateWindow(index, { closesAt: event.target.value })
                              }
                            />
                          </label>
                          <button
                            className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-100 hover:border-red-400"
                            type="button"
                            onClick={() => removeWindow(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <aside className="h-fit rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Blackout dates</h2>
              <button
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400"
                type="button"
                onClick={() => setBlackouts((current) => [...current, emptyBlackout()])}
              >
                Add date
              </button>
            </div>

            {blackouts.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No closures added.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {blackouts.map((blackout, index) => (
                  <div className="space-y-3 rounded-md border border-slate-800 p-3" key={index}>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-400">Date</span>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        required
                        type="date"
                        value={blackout.date}
                        onChange={(event) => updateBlackout(index, { date: event.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-400">Reason</span>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        maxLength={120}
                        value={blackout.reason}
                        onChange={(event) => updateBlackout(index, { reason: event.target.value })}
                      />
                    </label>
                    <button
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-red-400"
                      type="button"
                      onClick={() =>
                        setBlackouts((current) =>
                          current.filter((_, currentIndex) => currentIndex !== index)
                        )
                      }
                    >
                      Remove blackout
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>
      </form>
    </main>
  );
}
