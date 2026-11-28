"use client";
import { useCallback, useEffect, useState } from "react";
import { calendarDayRange, dateInZone } from "@/app/lib/calendar";
type Booking = {
  id: string;
  startsAt: string;
  status: string;
  client: { name: string };
  service: { name: string };
};
export function DayView({ tenantId, timeZone }: { tenantId: string | null; timeZone: string }) {
  const [date, setDate] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("date");
    setDate(
      selected && /^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected : dateInZone(new Date(), timeZone)
    );
  }, [timeZone]);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      setBookings([]);
      try {
        if (!tenantId) throw new Error("Unable to determine your business.");
        const { start, end } = calendarDayRange(date, timeZone);
        const query = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
        const response = await fetch(`/api/bookings?${query}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error("Unable to load bookings. Please try again.");
        if (!controller.signal.aborted) setBookings(data.bookings);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Unable to load bookings.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [date, tenantId, timeZone]);

  const reloadBookings = useCallback(async () => {
    if (!date || !tenantId) return;
    const { start, end } = calendarDayRange(date, timeZone);
    const query = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
    const response = await fetch(`/api/bookings?${query}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok && data.ok) setBookings(data.bookings);
  }, [date, tenantId, timeZone]);

  async function patchBooking(id: string, body: Record<string, unknown>) {
    if (!tenantId) return;
    setBusyId(id);
    setActionError(null);
    try {
      const response = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || data.error || "Could not update booking.");
      }
      await reloadBookings();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not update booking.");
    } finally {
      setBusyId(null);
    }
  }

  function handleCancel(booking: Booking) {
    if (
      !window.confirm(`Cancel the booking for ${booking.client.name} at ${booking.service.name}?`)
    ) {
      return;
    }
    void patchBooking(booking.id, { status: "cancelled" });
  }

  function handleNoShow(booking: Booking) {
    if (!window.confirm(`Mark ${booking.client.name} as a no-show?`)) return;
    void patchBooking(booking.id, { status: "no_show" });
  }

  function handleReschedule(booking: Booking) {
    const defaultLocal = new Date(booking.startsAt);
    const localValue = new Date(defaultLocal.getTime() - defaultLocal.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    const next = window.prompt("New start time (local)", localValue);
    if (!next) return;
    const startsAt = new Date(next);
    if (Number.isNaN(startsAt.getTime())) {
      setActionError("Enter a valid date and time.");
      return;
    }
    if (!window.confirm(`Reschedule ${booking.client.name} to ${startsAt.toLocaleString()}?`)) {
      return;
    }
    void patchBooking(booking.id, { startsAt: startsAt.toISOString() });
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 text-slate-100 sm:px-6">
      <h1 className="text-3xl font-semibold">Calendar</h1>
      <label className="flex flex-col gap-2">
        Date
        <input
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) setDate(event.target.value);
          }}
          className="w-fit rounded border border-slate-700 bg-slate-900 px-3 py-2"
        />
      </label>
      <p className="text-sm text-slate-400">Times shown in {timeZone}.</p>
      {actionError ? (
        <p role="alert" className="text-sm text-red-300">
          {actionError}
        </p>
      ) : null}
      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p>Loading bookings...</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : bookings.length === 0 ? (
          <p>No bookings for this date.</p>
        ) : (
          <ul
            aria-label="Day bookings"
            className="divide-y divide-slate-800 rounded border border-slate-800"
          >
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-semibold">{booking.client.name}</p>
                  <p>{booking.service.name}</p>
                </div>
                <time dateTime={booking.startsAt}>
                  {new Intl.DateTimeFormat("en-NG", {
                    timeZone,
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(booking.startsAt))}
                </time>
                <span>{booking.status}</span>
                {booking.status !== "cancelled" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-slate-600 px-2 py-1 text-sm hover:bg-slate-800 disabled:opacity-50"
                      disabled={busyId === booking.id}
                      onClick={() => handleCancel(booking)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-600 px-2 py-1 text-sm hover:bg-slate-800 disabled:opacity-50"
                      disabled={busyId === booking.id}
                      onClick={() => handleReschedule(booking)}
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-600 px-2 py-1 text-sm hover:bg-slate-800 disabled:opacity-50"
                      disabled={busyId === booking.id}
                      onClick={() => handleNoShow(booking)}
                    >
                      No-show
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
