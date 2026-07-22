"use client";

import { DragEvent, useEffect, useMemo, useState } from "react";

export type CalendarBooking = {
  id: string;
  clientName: string;
  serviceName: string;
  staffName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
};

type CalendarViewProps = {
  bookings?: CalendarBooking[];
  initialDate: string;
};

type CalendarMode = "day" | "week";

const calendarStartHour = 8;
const calendarEndHour = 18;
const hourHeight = 72;
const snapMinutes = 15;
const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date) {
  const day = startOfDay(date);
  const mondayOffset = (day.getDay() + 6) % 7;
  return addDays(day, -mondayOffset);
}

export function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function bookingOffsetPercent(booking: Pick<CalendarBooking, "startsAt">) {
  const startsAt = new Date(booking.startsAt);
  const minutesFromOpen = (startsAt.getHours() - calendarStartHour) * 60 + startsAt.getMinutes();

  return Math.max(0, (minutesFromOpen / ((calendarEndHour - calendarStartHour) * 60)) * 100);
}

export function bookingHeightPx(booking: Pick<CalendarBooking, "startsAt" | "endsAt">) {
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  const durationMinutes = Math.max(15, (endsAt.getTime() - startsAt.getTime()) / minuteMs);

  return Math.max(34, (durationMinutes / 60) * hourHeight);
}

export function bookingsForDay(bookings: CalendarBooking[], day: Date) {
  return bookings
    .filter((booking) => sameDay(new Date(booking.startsAt), day))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

export function moveBookingToStart(booking: CalendarBooking, startsAt: Date) {
  const currentStart = new Date(booking.startsAt);
  const currentEnd = new Date(booking.endsAt);
  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const endsAt = new Date(startsAt.getTime() + durationMs);

  return {
    ...booking,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

export function startForDrop(day: Date, clientY: number, bounds: Pick<DOMRect, "top" | "height">) {
  const offsetY = clientY - bounds.top;

  if (offsetY < 0 || offsetY > bounds.height) {
    return null;
  }

  const minutesFromOpen = Math.floor((offsetY / hourHeight) * 60);
  const snappedMinutes = Math.floor(minutesFromOpen / snapMinutes) * snapMinutes;
  const startsAt = new Date(day);
  startsAt.setHours(calendarStartHour, 0, 0, 0);
  startsAt.setMinutes(startsAt.getMinutes() + snappedMinutes);

  return startsAt;
}

export function isInsideCalendarHours(booking: Pick<CalendarBooking, "startsAt" | "endsAt">) {
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  const calendarStart = startOfDay(startsAt);
  calendarStart.setHours(calendarStartHour, 0, 0, 0);
  const calendarEnd = startOfDay(startsAt);
  calendarEnd.setHours(calendarEndHour, 0, 0, 0);

  return startsAt >= calendarStart && endsAt <= calendarEnd && startsAt < endsAt;
}

export function hasBookingOverlap(candidate: CalendarBooking, bookings: CalendarBooking[]) {
  const candidateStart = new Date(candidate.startsAt).getTime();
  const candidateEnd = new Date(candidate.endsAt).getTime();

  return bookings.some((booking) => {
    if (booking.id === candidate.id) {
      return false;
    }

    if (!sameDay(new Date(candidate.startsAt), new Date(booking.startsAt))) {
      return false;
    }

    const bookingStart = new Date(booking.startsAt).getTime();
    const bookingEnd = new Date(booking.endsAt).getTime();
    return candidateStart < bookingEnd && candidateEnd > bookingStart;
  });
}

export function validateReschedule(candidate: CalendarBooking, bookings: CalendarBooking[]) {
  if (!isInsideCalendarHours(candidate)) {
    return "outside_hours";
  }

  if (hasBookingOverlap(candidate, bookings)) {
    return "booking_overlap";
  }

  return null;
}

export type BookingPayload = Partial<CalendarBooking> & {
  id: unknown;
  startsAt: unknown;
  endsAt: unknown;
  client?: { name?: unknown } | null;
  service?: { name?: unknown } | null;
  staff?: { name?: unknown } | null;
};

export function normalizeBooking(input: BookingPayload) {
  const client = input.client ?? undefined;
  const service = input.service ?? undefined;
  const staff = input.staff ?? undefined;

  return {
    id: String(input.id),
    clientName:
      typeof input.clientName === "string"
        ? input.clientName
        : typeof client?.name === "string"
          ? client.name
          : "Client",
    serviceName:
      typeof input.serviceName === "string"
        ? input.serviceName
        : typeof service?.name === "string"
          ? service.name
          : "Service",
    staffName:
      typeof input.staffName === "string"
        ? input.staffName
        : typeof staff?.name === "string"
          ? staff.name
          : null,
    startsAt: String(input.startsAt),
    endsAt: String(input.endsAt),
    status: typeof input.status === "string" ? input.status : "confirmed",
    notes: typeof input.notes === "string" ? input.notes : null,
  };
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRange(start: Date, mode: CalendarMode) {
  if (mode === "day") {
    return new Intl.DateTimeFormat("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(start);
  }

  const end = addDays(start, 6);
  return `${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(start)} - ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end)}`;
}

function timeSlots() {
  return Array.from({ length: calendarEndHour - calendarStartHour + 1 }, (_, index) => {
    const hour = calendarStartHour + index;
    return `${String(hour).padStart(2, "0")}:00`;
  });
}

function BookingBlock({ booking }: { booking: CalendarBooking }) {
  return (
    <button
      draggable
      className="absolute left-1 right-1 overflow-hidden rounded-md border border-emerald-300/40 bg-emerald-500 px-2 py-1 text-left text-xs text-slate-950 shadow-sm shadow-slate-950/40"
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", booking.id);
      }}
      style={{
        top: `${bookingOffsetPercent(booking)}%`,
        height: `${bookingHeightPx(booking)}px`,
      }}
      type="button"
    >
      <span className="block truncate font-semibold">{booking.clientName}</span>
      <span className="block truncate">{booking.serviceName}</span>
      <span className="block truncate opacity-80">
        {formatTime(booking.startsAt)} - {formatTime(booking.endsAt)}
      </span>
    </button>
  );
}

function DayColumn({
  bookings,
  day,
  onBookingDrop,
}: {
  bookings: CalendarBooking[];
  day: Date;
  onBookingDrop: (bookingId: string, day: Date, event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="min-w-0 border-l border-slate-800 first:border-l-0">
      <div className="border-b border-slate-800 px-2 py-2 text-center">
        <p className="truncate text-sm font-medium text-slate-100">{formatDayLabel(day)}</p>
        <p className="text-xs text-slate-500">{bookings.length} bookings</p>
      </div>
      <div
        className="relative"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const bookingId = event.dataTransfer.getData("text/plain");
          if (bookingId) {
            onBookingDrop(bookingId, day, event);
          }
        }}
        style={{ height: `${(calendarEndHour - calendarStartHour) * hourHeight}px` }}
      >
        {bookings.length ? (
          bookings.map((booking) => <BookingBlock booking={booking} key={booking.id} />)
        ) : (
          <p className="px-2 py-4 text-center text-xs text-slate-500">Open</p>
        )}
      </div>
    </div>
  );
}

export function CalendarView({ bookings = [], initialDate }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date(initialDate)));
  const [visibleBookings, setVisibleBookings] = useState(() => bookings.map(normalizeBooking));
  const [notice, setNotice] = useState<string | null>(null);
  const days = useMemo(() => {
    if (mode === "day") {
      return [anchorDate];
    }

    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [anchorDate, mode]);
  const rangeStart = mode === "day" ? anchorDate : days[0];
  const slots = useMemo(() => timeSlots(), []);

  useEffect(() => {
    function addCreatedBooking(event: Event) {
      const detail = (event as CustomEvent<BookingPayload>).detail;
      if (!detail) {
        return;
      }

      setVisibleBookings((current) => {
        const next = normalizeBooking(detail);
        return [next, ...current.filter((booking) => booking.id !== next.id)];
      });
    }

    window.addEventListener("booking:manual-created", addCreatedBooking);
    return () => window.removeEventListener("booking:manual-created", addCreatedBooking);
  }, []);

  async function rescheduleBooking(bookingId: string, day: Date, event: DragEvent<HTMLDivElement>) {
    setNotice(null);

    const booking = visibleBookings.find((current) => current.id === bookingId);
    const startsAt = startForDrop(day, event.clientY, event.currentTarget.getBoundingClientRect());
    if (!booking || !startsAt) {
      setNotice("Drop inside business hours to reschedule.");
      return;
    }

    const nextBooking = moveBookingToStart(booking, startsAt);
    const invalidReason = validateReschedule(nextBooking, visibleBookings);
    if (invalidReason) {
      setNotice(
        invalidReason === "booking_overlap"
          ? "That time overlaps another booking."
          : "Drop inside business hours to reschedule."
      );
      return;
    }

    const previousBookings = visibleBookings;
    setVisibleBookings((current) =>
      current.map((currentBooking) =>
        currentBooking.id === nextBooking.id ? nextBooking : currentBooking
      )
    );

    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(nextBooking.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ startsAt: nextBooking.startsAt, endsAt: nextBooking.endsAt }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to reschedule booking");
      }

      if (data.booking) {
        const savedBooking = normalizeBooking(data.booking);
        setVisibleBookings((current) =>
          current.map((currentBooking) =>
            currentBooking.id === savedBooking.id ? savedBooking : currentBooking
          )
        );
      }
    } catch (error) {
      setVisibleBookings(previousBookings);
      setNotice(error instanceof Error ? error.message : "Unable to reschedule booking");
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
            Calendar
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {formatRange(rangeStart, mode)}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 rounded-md border border-slate-700 p-1">
            {(["day", "week"] as const).map((option) => (
              <button
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  mode === option ? "bg-emerald-500 text-slate-950" : "text-slate-300"
                }`}
                key={option}
                onClick={() => setMode(option)}
                type="button"
              >
                {option === "day" ? "Day" : "Week"}
              </button>
            ))}
          </div>
          <button
            className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
            onClick={() => setAnchorDate(startOfDay(new Date(initialDate)))}
            type="button"
          >
            Today
          </button>
          <button
            aria-label="Previous"
            className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
            onClick={() => setAnchorDate((current) => addDays(current, mode === "day" ? -1 : -7))}
            type="button"
          >
            &lt;
          </button>
          <button
            aria-label="Next"
            className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
            onClick={() => setAnchorDate((current) => addDays(current, mode === "day" ? 1 : 7))}
            type="button"
          >
            &gt;
          </button>
        </div>
      </div>

      {notice ? (
        <p
          className="mt-4 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
        <div
          className={`grid min-w-[760px] ${mode === "day" ? "grid-cols-[72px_1fr]" : "grid-cols-[72px_repeat(7,minmax(96px,1fr))]"}`}
        >
          <div className="border-r border-slate-800">
            <div className="h-[57px] border-b border-slate-800" />
            {slots.slice(0, -1).map((slot) => (
              <div
                className="border-b border-slate-800 px-2 py-1 text-xs text-slate-500"
                key={slot}
                style={{ height: `${hourHeight}px` }}
              >
                {slot}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <DayColumn
              bookings={bookingsForDay(visibleBookings, day)}
              day={day}
              key={day.toISOString()}
              onBookingDrop={(bookingId, dropDay, dropEvent) =>
                void rescheduleBooking(bookingId, dropDay, dropEvent)
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
