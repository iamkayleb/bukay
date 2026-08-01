"use client";

import { useEffect, useMemo, useState } from "react";
import type { BookingRow } from "./day-week-view";

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

export type EditBookingPatch = {
  serviceId?: string;
  startsAt?: string;
  notes?: string | null;
  status?: string;
};

type EditBookingModalProps = {
  booking: BookingRow | null;
  services: Service[];
  onClose: () => void;
  onSave: (bookingId: string, patch: EditBookingPatch) => Promise<void>;
};

const STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function EditBookingModal({
  booking,
  services,
  onClose,
  onSave,
}: EditBookingModalProps) {
  const activeServices = useMemo(
    () => services.filter((s) => s.active || (booking && s.id === booking.serviceId)),
    [services, booking],
  );

  const [serviceId, setServiceId] = useState(booking?.serviceId ?? "");
  const [startsAt, setStartsAt] = useState(
    booking ? toDateTimeLocal(booking.startsAt) : "",
  );
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [status, setStatus] = useState(booking?.status ?? "confirmed");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!booking) return;
    setServiceId(booking.serviceId);
    setStartsAt(toDateTimeLocal(booking.startsAt));
    setNotes(booking.notes ?? "");
    setStatus(booking.status ?? "confirmed");
    setError(null);
  }, [booking]);

  if (!booking) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking) return;
    setError(null);
    setSubmitting(true);

    const patch: EditBookingPatch = {};
    if (serviceId && serviceId !== booking.serviceId) {
      patch.serviceId = serviceId;
    }
    if (startsAt) {
      const iso = new Date(startsAt).toISOString();
      if (iso !== booking.startsAt) patch.startsAt = iso;
    }
    const trimmedNotes = notes.trim();
    if (trimmedNotes !== (booking.notes ?? "")) {
      patch.notes = trimmedNotes ? trimmedNotes : null;
    }
    if (status && status !== booking.status) {
      patch.status = status;
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      setSubmitting(false);
      return;
    }

    try {
      await onSave(booking.id, patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit booking"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-lg border border-slate-800 bg-slate-950 p-5 shadow-xl"
      >
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Edit booking</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ×
          </button>
        </header>

        <p className="text-xs text-slate-400">
          {booking.clientName ?? "Client"}
          {booking.staffName ? ` · ${booking.staffName}` : ""}
        </p>

        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Service
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          >
            {activeServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes}m)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Start time
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
