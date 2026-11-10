"use client";
import { useEffect, useState } from "react";
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
          headers: { "x-tenant-id": tenantId },
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
