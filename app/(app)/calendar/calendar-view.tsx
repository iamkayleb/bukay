"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";

import type { ServiceOption } from "./manual-booking-form";

export type CalendarBooking = {
  id: string;
  serviceId: string;
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
  services?: ServiceOption[];
};

type CalendarMode = "day" | "week";
type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

type EditBookingFormState = {
  serviceId: string;
  startsAt: string;
  notes: string;
  status: BookingStatus;
};

type EditBookingFieldErrors = Partial<Record<keyof EditBookingFormState | "_form", string>>;

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

export function dateTimeLocalValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * minuteMs);
  return local.toISOString().slice(0, 16);
}

export function editFormFromBooking(booking: CalendarBooking): EditBookingFormState {
  return {
    serviceId: booking.serviceId,
    startsAt: dateTimeLocalValue(booking.startsAt),
    notes: booking.notes ?? "",
    status: booking.status as BookingStatus,
  };
}

export function validateEditBookingForm(
  form: EditBookingFormState,
  services: ServiceOption[]
): EditBookingFieldErrors {
  const errors: EditBookingFieldErrors = {};
  const startsAt = form.startsAt ? new Date(form.startsAt) : null;

  if (!services.some((service) => service.id === form.serviceId)) {
    errors.serviceId = "Choose a service";
  }

  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    errors.startsAt = "Choose a valid time";
  }

  if (!["pending", "confirmed", "cancelled", "completed"].includes(form.status)) {
    errors.status = "Choose a status";
  }

  return errors;
}

export function buildEditBookingPayload(form: EditBookingFormState, services: ServiceOption[]) {
  const service = services.find((option) => option.id === form.serviceId);
  const startsAt = new Date(form.startsAt);
  const endsAt = new Date(startsAt.getTime() + (service?.durationMinutes ?? 0) * minuteMs);

  return {
    serviceId: form.serviceId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    notes: form.notes.trim() || null,
    status: form.status,
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
    serviceId: typeof input.serviceId === "string" ? input.serviceId : "",
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

function hasErrors(errors: EditBookingFieldErrors) {
  return Object.values(errors).some(Boolean);
}

function firstError(errors: string[] | undefined) {
  return errors?.[0];
}

function apiEditErrors(error: {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
}): EditBookingFieldErrors {
  const fieldErrors = error.fieldErrors ?? {};

  return {
    serviceId: firstError(fieldErrors.serviceId),
    startsAt: firstError(fieldErrors.startsAt),
    notes: firstError(fieldErrors.notes),
    status: firstError(fieldErrors.status),
    _form: firstError(error.formErrors) ?? error.error,
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

function BookingBlock({
  booking,
  onEdit,
}: {
  booking: CalendarBooking;
  onEdit: (booking: CalendarBooking) => void;
}) {
  return (
    <button
      draggable
      className="absolute left-1 right-1 overflow-hidden rounded-md border border-emerald-300/40 bg-emerald-500 px-2 py-1 text-left text-xs text-slate-950 shadow-sm shadow-slate-950/40"
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", booking.id);
      }}
      onClick={() => onEdit(booking)}
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
  onBookingEdit,
  onBookingDrop,
}: {
  bookings: CalendarBooking[];
  day: Date;
  onBookingEdit: (booking: CalendarBooking) => void;
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
          bookings.map((booking) => (
            <BookingBlock booking={booking} key={booking.id} onEdit={onBookingEdit} />
          ))
        ) : (
          <p className="px-2 py-4 text-center text-xs text-slate-500">Open</p>
        )}
      </div>
    </div>
  );
}

export function CalendarView({ bookings = [], initialDate, services = [] }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date(initialDate)));
  const [visibleBookings, setVisibleBookings] = useState(() => bookings.map(normalizeBooking));
  const [notice, setNotice] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditBookingFormState | null>(null);
  const [editErrors, setEditErrors] = useState<EditBookingFieldErrors>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const days = useMemo(() => {
    if (mode === "day") {
      return [anchorDate];
    }

    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [anchorDate, mode]);
  const rangeStart = mode === "day" ? anchorDate : days[0];
  const slots = useMemo(() => timeSlots(), []);
  const editingBooking = visibleBookings.find((booking) => booking.id === editingBookingId) ?? null;

  function openEditor(booking: CalendarBooking) {
    setEditingBookingId(booking.id);
    setEditForm(editFormFromBooking(booking));
    setEditErrors({});
    setNotice(null);
  }

  function closeEditor() {
    setEditingBookingId(null);
    setEditForm(null);
    setEditErrors({});
  }

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

  async function saveBookingEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!editingBooking || !editForm) {
      return;
    }

    const nextErrors = validateEditBookingForm(editForm, services);
    if (hasErrors(nextErrors)) {
      setEditErrors(nextErrors);
      return;
    }

    const payload = buildEditBookingPayload(editForm, services);
    const service = services.find((option) => option.id === payload.serviceId);
    const nextBooking = {
      ...editingBooking,
      serviceId: payload.serviceId,
      serviceName: service?.name ?? editingBooking.serviceName,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      notes: payload.notes,
      status: payload.status,
    };
    const invalidReason = validateReschedule(nextBooking, visibleBookings);

    if (invalidReason) {
      setEditErrors({
        _form:
          invalidReason === "booking_overlap"
            ? "That time overlaps another booking."
            : "Choose a time inside business hours.",
      });
      return;
    }

    const previousBookings = visibleBookings;
    setEditErrors({});
    setIsSavingEdit(true);
    setVisibleBookings((current) =>
      current.map((booking) => (booking.id === nextBooking.id ? nextBooking : booking))
    );

    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(editingBooking.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.error === "validation_failed") {
          setVisibleBookings(previousBookings);
          setEditErrors(apiEditErrors(data));
          return;
        }

        throw new Error(data.error ?? "Unable to update booking");
      }

      if (data.booking) {
        const savedBooking = normalizeBooking(data.booking);
        setVisibleBookings((current) =>
          current.map((booking) => (booking.id === savedBooking.id ? savedBooking : booking))
        );
      }

      closeEditor();
      setNotice("Booking updated.");
    } catch (error) {
      setVisibleBookings(previousBookings);
      setEditErrors({
        _form: error instanceof Error ? error.message : "Unable to update booking",
      });
    } finally {
      setIsSavingEdit(false);
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
              onBookingEdit={openEditor}
              onBookingDrop={(bookingId, dropDay, dropEvent) =>
                void rescheduleBooking(bookingId, dropDay, dropEvent)
              }
            />
          ))}
        </div>
      </div>

      {editingBooking && editForm ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 py-6"
          role="dialog"
        >
          <form
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onSubmit={(event) => void saveBookingEdits(event)}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
                  Edit booking
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  {editingBooking.clientName}
                </h3>
              </div>
              <button
                aria-label="Close editor"
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-emerald-400"
                onClick={closeEditor}
                type="button"
              >
                Close
              </button>
            </div>

            {editErrors._form ? (
              <p className="mt-4 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {editErrors._form}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Service</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  value={editForm.serviceId}
                  onChange={(event) => setEditForm({ ...editForm, serviceId: event.target.value })}
                >
                  <option value="">Choose service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} - {service.durationMinutes} min
                    </option>
                  ))}
                </select>
                {editErrors.serviceId ? (
                  <span className="mt-1 block text-xs text-red-300">{editErrors.serviceId}</span>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Time</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  type="datetime-local"
                  value={editForm.startsAt}
                  onChange={(event) => setEditForm({ ...editForm, startsAt: event.target.value })}
                />
                {editErrors.startsAt ? (
                  <span className="mt-1 block text-xs text-red-300">{editErrors.startsAt}</span>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Status</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm({ ...editForm, status: event.target.value as BookingStatus })
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
                {editErrors.status ? (
                  <span className="mt-1 block text-xs text-red-300">{editErrors.status}</span>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Notes</span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  value={editForm.notes}
                  onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
                />
                {editErrors.notes ? (
                  <span className="mt-1 block text-xs text-red-300">{editErrors.notes}</span>
                ) : null}
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
                onClick={closeEditor}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSavingEdit}
                type="submit"
              >
                {isSavingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
