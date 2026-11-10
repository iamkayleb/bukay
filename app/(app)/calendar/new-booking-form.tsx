"use client";

import { FormEvent, useState } from "react";
import { calendarDayRange } from "@/app/lib/calendar";

type Option = { id: string; name: string };
export function NewBookingForm({
  tenantId,
  timeZone,
  services,
  clients,
}: {
  tenantId: string;
  timeZone: string;
  services: Option[];
  clients: Option[];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError(null);
    try {
      const date = String(data.get("date"));
      const time = String(data.get("time"));
      // Resolve the business-local wall clock independently of the browser zone.
      const [hour, minute] = time.split(":").map(Number);
      let startsAt = new Date(
        calendarDayRange(date, timeZone).start.getTime() + (hour * 60 + minute) * 60000
      );
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      for (let i = 0; i < 3; i++) {
        const [h, m] = formatter.format(startsAt).split(":").map(Number);
        startsAt = new Date(startsAt.getTime() + (hour * 60 + minute - h * 60 - m) * 60000);
      }
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({
          serviceId: data.get("serviceId"),
          startsAt: startsAt.toISOString(),
          ...(clientId ? { clientId } : { name: data.get("name"), phone: data.get("phone") }),
          notes: data.get("notes"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = {
          slot_unavailable: "That time overlaps another booking. Choose another time.",
          outside_business_hours: "Choose an available service slot within business hours.",
          invalid_phone: "Enter a valid Nigerian mobile number.",
          client_not_found: "This client is no longer available. Reload and try again.",
        };
        throw new Error(
          messages[result.error] ?? "Unable to create booking. Check the details and try again."
        );
      }
      window.location.assign(`/calendar?date=${date}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create booking.");
    } finally {
      setSaving(false);
    }
  }
  const field =
    "mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400";
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mx-auto mb-10 max-w-3xl space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-slate-200"
    >
      <h2 className="text-lg font-semibold text-white">New booking</h2>
      <p className="text-sm text-slate-400">
        Times in {timeZone}. Bookings are confirmed and unpaid.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <label className="block">
        Service
        <select required name="serviceId" className={field} defaultValue="">
          <option value="" disabled>
            Choose a service
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Date
        <input required type="date" name="date" className={field} />
      </label>
      <label className="block">
        Time
        <input required type="time" name="time" className={field} />
      </label>
      <label className="block">
        Client
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={field}>
          <option value="">New client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {!clientId && (
        <>
          <label className="block">
            Name
            <input required name="name" autoComplete="name" className={field} />
          </label>
          <label className="block">
            Phone
            <input required type="tel" name="phone" autoComplete="tel" className={field} />
          </label>
        </>
      )}
      <label className="block">
        Notes
        <textarea name="notes" className={field} />
      </label>
      <button
        disabled={saving || !services.length}
        className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
        type="submit"
      >
        {saving ? "Saving..." : "Create booking"}
      </button>
    </form>
  );
}
