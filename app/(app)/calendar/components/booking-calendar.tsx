"use client";

import { useState } from "react";
import { ManualBookingForm } from "./manual-booking-form";

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

type BookingRow = {
  id: string;
  serviceId: string;
  staffId: string | null;
  clientId: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  clientName?: string;
  serviceName?: string;
  staffName?: string | null;
};

type BookingCalendarProps = {
  services: Service[];
  staff: Staff[];
  initialBookings: BookingRow[];
};

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

export function BookingCalendar({ services, staff, initialBookings }: BookingCalendarProps) {
  const [bookings, setBookings] = useState<BookingRow[]>(initialBookings);

  function decorate(created: BookingRow): BookingRow {
    const service = services.find((s) => s.id === created.serviceId);
    const staffMember = staff.find((s) => s.id === created.staffId);
    return {
      ...created,
      serviceName: created.serviceName ?? service?.name,
      staffName: created.staffName ?? staffMember?.name ?? null,
    };
  }

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
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
    </section>
  );
}
