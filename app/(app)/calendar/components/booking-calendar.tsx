"use client";

import { useCallback, useEffect, useState } from "react";
import { ManualBookingForm } from "./manual-booking-form";
import {
  DayWeekNavigator,
  DayWeekView,
  type BookingRow,
  type RescheduleTarget,
  type ViewMode,
} from "./day-week-view";
import {
  EditBookingModal,
  type EditBookingPatch,
} from "./edit-booking-modal";

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

type Staff = {
  id: string;
  name: string;
  active: boolean;
};

type BookingCalendarProps = {
  services: Service[];
  staff: Staff[];
  initialBookings: BookingRow[];
};

type Toast = { kind: "error" | "success"; message: string } | null;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error;
  } catch {
    return undefined;
  }
}

function mapPatchError(code: string | undefined, status: number): string {
  switch (code) {
    case "booking_conflict":
      return "That slot overlaps another booking.";
    case "outside_business_hours":
      return "That time is outside business hours.";
    case "service_not_found":
      return "That service is no longer available.";
    case "service_inactive":
      return "That service is inactive.";
    case "booking_not_found":
      return "Booking no longer exists.";
    case "validation_failed":
      return "Please check the changes and try again.";
    default:
      return `Save failed (HTTP ${status}).`;
  }
}

export function BookingCalendar({ services, staff, initialBookings }: BookingCalendarProps) {
  const [bookings, setBookings] = useState<BookingRow[]>(initialBookings);
  const [mode, setMode] = useState<ViewMode>("day");
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [editing, setEditing] = useState<BookingRow | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  // Locale is read from the browser after mount to avoid an SSR/CSR hydration
  // mismatch — server renders with the Sunday-start default; the effect then
  // upgrades to the user's locale (Monday-first for en-GB, etc).
  const [locale, setLocale] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.language) {
      setLocale(navigator.language);
    }
  }, []);

  const decorate = useCallback(
    (created: BookingRow): BookingRow => {
      const service = services.find((s) => s.id === created.serviceId);
      const staffMember = staff.find((s) => s.id === created.staffId);
      return {
        ...created,
        serviceName: created.serviceName ?? service?.name,
        staffName: created.staffName ?? staffMember?.name ?? null,
      };
    },
    [services, staff],
  );

  const showToast = useCallback((next: Toast) => {
    setToast(next);
    if (next) {
      window.setTimeout(() => setToast(null), 4000);
    }
  }, []);

  const handleReschedule = useCallback(
    async ({ bookingId, startsAt, endsAt }: RescheduleTarget) => {
      const previous = bookings.find((b) => b.id === bookingId);
      if (!previous) return;

      const optimistic = bookings.map((b) =>
        b.id === bookingId ? { ...b, startsAt, endsAt } : b,
      );
      setBookings(optimistic);

      try {
        const res = await fetch(`/api/bookings/${bookingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startsAt }),
        });

        if (!res.ok) {
          const code = await readErrorCode(res);
          setBookings((prev) =>
            prev.map((b) => (b.id === bookingId ? previous : b)),
          );
          showToast({ kind: "error", message: mapPatchError(code, res.status) });
          return;
        }

        const body = (await res.json()) as { booking: BookingRow };
        setBookings((prev) =>
          prev.map((b) =>
            b.id === bookingId
              ? decorate({ ...b, ...body.booking })
              : b,
          ),
        );
        showToast({ kind: "success", message: "Booking rescheduled." });
      } catch {
        setBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? previous : b)),
        );
        showToast({ kind: "error", message: "Could not reach the server." });
      }
    },
    [bookings, showToast, decorate],
  );

  const handleEditSave = useCallback(
    async (bookingId: string, patch: EditBookingPatch) => {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const code = await readErrorCode(res);
        throw new Error(mapPatchError(code, res.status));
      }

      const body = (await res.json()) as { booking: BookingRow };
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? decorate({ ...b, ...body.booking }) : b,
        ),
      );
      showToast({ kind: "success", message: "Booking updated." });
    },
    [showToast, decorate],
  );

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Calendar
        </p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Add a booking</h2>
        <p className="text-sm text-slate-300">
          Pick or create a client, choose a service and a slot, and confirm.
        </p>
      </header>

      <ManualBookingForm
        services={services}
        staff={staff}
        onCreated={(booking) => {
          const decorated = decorate({
            id: booking.id,
            serviceId: booking.serviceId,
            staffId: booking.staffId,
            clientId: booking.clientId,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            notes: booking.notes,
            clientName: booking.clientName,
          });
          setBookings((prev) =>
            [decorated, ...prev.filter((b) => b.id !== decorated.id)].sort((a, b) =>
              a.startsAt < b.startsAt ? -1 : 1,
            ),
          );
        }}
      />

      <div className="flex flex-col gap-3">
        <DayWeekNavigator
          mode={mode}
          onModeChange={setMode}
          anchorDate={anchorDate}
          onAnchorChange={setAnchorDate}
          locale={locale}
        />
        <DayWeekView
          bookings={bookings}
          mode={mode}
          anchorDate={anchorDate}
          onSelect={(b) => setEditing(b)}
          onReschedule={handleReschedule}
          locale={locale}
        />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-lg font-semibold text-white">Upcoming</h3>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">
            No scheduled bookings yet. Newly created bookings appear here immediately.
          </p>
        ) : (
          <ul aria-label="Bookings list" className="mt-3 divide-y divide-slate-800">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-white">{b.clientName ?? "Client"}</span>
                  <span className="text-slate-300">{b.serviceName ?? "Service"}</span>
                  {b.staffName ? <span className="text-slate-500">· {b.staffName}</span> : null}
                </div>
                <div className="text-xs text-slate-400">
                  <time dateTime={b.startsAt}>{formatWhen(b.startsAt)}</time>
                  {" – "}
                  <time dateTime={b.endsAt}>{formatWhen(b.endsAt)}</time>
                </div>
                {b.notes ? <p className="text-xs text-slate-500">{b.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <EditBookingModal
        booking={editing}
        services={services}
        onClose={() => setEditing(null)}
        onSave={handleEditSave}
      />

      {toast ? (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm shadow-lg ${
            toast.kind === "error"
              ? "bg-red-500/90 text-white"
              : "bg-emerald-500/90 text-slate-950"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  );
}
