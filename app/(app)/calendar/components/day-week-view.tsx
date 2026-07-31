"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  addDays,
  resolveWeekStart,
  startOfDay,
  startOfWeek,
  type Weekday,
} from "@/app/lib/calendar/week";

export type BookingRow = {
  id: string;
  serviceId: string;
  staffId: string | null;
  clientId: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  status?: string | null;
  clientName?: string;
  serviceName?: string;
  staffName?: string | null;
};

export type ViewMode = "day" | "week";

export type RescheduleTarget = {
  bookingId: string;
  startsAt: string;
  endsAt: string;
};

type DayWeekViewProps = {
  bookings: BookingRow[];
  mode: ViewMode;
  anchorDate: Date;
  openingHour?: number;
  closingHour?: number;
  slotMinutes?: number;
  weekStartsOn?: Weekday;
  locale?: string;
  onSelect?: (booking: BookingRow) => void;
  onReschedule?: (target: RescheduleTarget) => void | Promise<void>;
};

const DEFAULT_OPENING_HOUR = 7;
const DEFAULT_CLOSING_HOUR = 20;
const DEFAULT_SLOT_MINUTES = 30;
const ROW_HEIGHT_PX = 32;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatHour(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: hour % 1 === 0 ? undefined : "2-digit",
  });
}

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function DayWeekView({
  bookings,
  mode,
  anchorDate,
  openingHour = DEFAULT_OPENING_HOUR,
  closingHour = DEFAULT_CLOSING_HOUR,
  slotMinutes = DEFAULT_SLOT_MINUTES,
  weekStartsOn,
  locale,
  onSelect,
  onReschedule,
}: DayWeekViewProps) {
  const dayCount = mode === "day" ? 1 : 7;
  const resolvedWeekStart: Weekday = weekStartsOn ?? resolveWeekStart(locale);
  const gridStart =
    mode === "day"
      ? startOfDay(anchorDate)
      : startOfWeek(anchorDate, resolvedWeekStart);

  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(gridStart, i)),
    [dayCount, gridStart],
  );

  const rowsPerHour = 60 / slotMinutes;
  const totalRows = (closingHour - openingHour) * rowsPerHour;

  const hourLabels = useMemo(
    () =>
      Array.from({ length: closingHour - openingHour + 1 }, (_, i) => ({
        hour: openingHour + i,
      })),
    [openingHour, closingHour],
  );

  const [dropTarget, setDropTarget] = useState<{
    dayIndex: number;
    slotIndex: number;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const bookingsByDay = useMemo(() => {
    const buckets: BookingRow[][] = Array.from({ length: dayCount }, () => []);
    for (const b of bookings) {
      const start = new Date(b.startsAt);
      for (let i = 0; i < days.length; i++) {
        if (sameDay(start, days[i])) {
          buckets[i].push(b);
          break;
        }
      }
    }
    return buckets;
  }, [bookings, days, dayCount]);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, booking: BookingRow) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", booking.id);
      setDraggingId(booking.id);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, dayIndex: number, slotIndex: number) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget({ dayIndex, slotIndex });
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const performReschedule = useCallback(
    (bookingId: string, dayIndex: number, slotIndex: number) => {
      if (!onReschedule) return;
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) return;

      const day = days[dayIndex];
      if (!day) return;

      const start = new Date(day);
      start.setHours(openingHour, 0, 0, 0);
      start.setMinutes(start.getMinutes() + slotIndex * slotMinutes);

      const prevStart = new Date(booking.startsAt);
      const prevEnd = new Date(booking.endsAt);
      const durationMs = prevEnd.getTime() - prevStart.getTime();
      const end = new Date(start.getTime() + durationMs);

      if (start.getTime() === prevStart.getTime()) return;

      void onReschedule({
        bookingId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
    },
    [bookings, days, openingHour, slotMinutes, onReschedule],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, dayIndex: number, slotIndex: number) => {
      event.preventDefault();
      const bookingId = event.dataTransfer.getData("text/plain");
      setDraggingId(null);
      setDropTarget(null);
      if (!bookingId) return;
      performReschedule(bookingId, dayIndex, slotIndex);
    },
    [performReschedule],
  );

  // Touch/pen drag support via Pointer Events. Mouse users still get the
  // native HTML5 drag-and-drop path above; this branch only activates for
  // touch/pen pointers (HTML5 DnD is unreliable on mobile).
  const pointerDragRef = useRef<{
    pointerId: number;
    bookingId: string;
    moved: boolean;
    lastTarget: { dayIndex: number; slotIndex: number } | null;
  } | null>(null);

  const findSlotFromPoint = useCallback(
    (clientX: number, clientY: number):
      | { dayIndex: number; slotIndex: number }
      | null => {
      if (typeof document === "undefined") return null;
      const el = document.elementFromPoint(clientX, clientY);
      if (!el) return null;
      const slotEl = (el as Element).closest?.("[data-slot-day]");
      if (!slotEl) return null;
      const day = Number((slotEl as HTMLElement).dataset.slotDay);
      const slot = Number((slotEl as HTMLElement).dataset.slotIndex);
      if (Number.isNaN(day) || Number.isNaN(slot)) return null;
      return { dayIndex: day, slotIndex: slot };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, booking: BookingRow) => {
      if (event.pointerType === "mouse") return;
      pointerDragRef.current = {
        pointerId: event.pointerId,
        bookingId: booking.id,
        moved: false,
        lastTarget: null,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // setPointerCapture can throw in some jsdom environments; ignore.
      }
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.pointerType === "mouse") return;
      event.preventDefault();
      drag.moved = true;
      if (draggingId !== drag.bookingId) setDraggingId(drag.bookingId);
      const hit = findSlotFromPoint(event.clientX, event.clientY);
      drag.lastTarget = hit;
      setDropTarget(hit);
    },
    [draggingId, findSlotFromPoint],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      pointerDragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      const target = drag.lastTarget;
      setDraggingId(null);
      setDropTarget(null);
      if (event.type === "pointercancel") return;
      if (!drag.moved) return; // treat stationary tap as click; onClick handles it
      if (!target) return;
      performReschedule(drag.bookingId, target.dayIndex, target.slotIndex);
    },
    [performReschedule],
  );

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `48px repeat(${dayCount}, minmax(0, 1fr))`,
    gridTemplateRows: `24px repeat(${totalRows}, ${ROW_HEIGHT_PX}px)`,
  };

  return (
    <div
      aria-label={mode === "day" ? "Day view" : "Week view"}
      data-testid="day-week-view"
      className="grid overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-200"
      style={gridStyle}
    >
      <div className="border-b border-r border-slate-800 bg-slate-900/70" />
      {days.map((day) => (
        <div
          key={day.toISOString()}
          className="flex items-center justify-center border-b border-r border-slate-800 bg-slate-900/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300"
        >
          {formatDayLabel(day)}
        </div>
      ))}

      {Array.from({ length: totalRows }).map((_, rowIndex) => {
        const showLabel = rowIndex % rowsPerHour === 0;
        const hour = openingHour + Math.floor(rowIndex / rowsPerHour);
        return (
          <div
            key={`label-${rowIndex}`}
            className="flex items-start justify-end border-b border-r border-slate-800 pr-2 text-[10px] text-slate-500"
            style={{ gridColumn: 1, gridRow: rowIndex + 2 }}
          >
            {showLabel ? formatHour(hour) : ""}
          </div>
        );
      })}

      {days.map((day, dayIndex) =>
        Array.from({ length: totalRows }).map((_, slotIndex) => {
          const isTarget =
            dropTarget?.dayIndex === dayIndex && dropTarget?.slotIndex === slotIndex;
          return (
            <div
              key={`cell-${dayIndex}-${slotIndex}`}
              data-testid={`slot-${dayIndex}-${slotIndex}`}
              data-slot-day={dayIndex}
              data-slot-index={slotIndex}
              onDragOver={(e) => handleDragOver(e, dayIndex, slotIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, dayIndex, slotIndex)}
              className={`border-b border-r border-slate-800/60 ${
                isTarget ? "bg-emerald-500/20" : "hover:bg-slate-900/40"
              }`}
              style={{
                gridColumn: dayIndex + 2,
                gridRow: slotIndex + 2,
              }}
            />
          );
        }),
      )}

      {days.map((day, dayIndex) => {
        const dayStart = new Date(day);
        dayStart.setHours(openingHour, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(closingHour, 0, 0, 0);
        const columnBookings = bookingsByDay[dayIndex] ?? [];

        return columnBookings.map((b) => {
          const start = new Date(b.startsAt);
          const end = new Date(b.endsAt);
          if (end <= dayStart || start >= dayEnd) return null;

          const clampedStart = start < dayStart ? dayStart : start;
          const clampedEnd = end > dayEnd ? dayEnd : end;

          const startMinutesFromOpen =
            (clampedStart.getTime() - dayStart.getTime()) / 60000;
          const durationMinutes =
            (clampedEnd.getTime() - clampedStart.getTime()) / 60000;

          const rowStart = Math.max(
            0,
            Math.floor(startMinutesFromOpen / slotMinutes),
          );
          const rowSpan = Math.max(
            1,
            Math.ceil(durationMinutes / slotMinutes),
          );

          const isDragging = draggingId === b.id;

          return (
            <button
              key={b.id}
              type="button"
              draggable
              onDragStart={(e) => handleDragStart(e, b)}
              onDragEnd={handleDragEnd}
              onPointerDown={(e) => handlePointerDown(e, b)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onClick={() => onSelect?.(b)}
              data-testid={`booking-${b.id}`}
              aria-label={`Booking for ${b.clientName ?? "client"}`}
              style={{
                gridColumn: dayIndex + 2,
                gridRow: `${rowStart + 2} / span ${rowSpan}`,
                opacity: isDragging ? 0.4 : 1,
                touchAction: "none",
              }}
              className="m-[2px] flex cursor-grab flex-col overflow-hidden rounded border border-emerald-500/60 bg-emerald-500/20 px-2 py-1 text-left text-[11px] text-white shadow-sm hover:bg-emerald-500/30 active:cursor-grabbing"
            >
              <span className="truncate font-semibold">
                {b.clientName ?? "Client"}
              </span>
              <span className="truncate text-slate-200">
                {b.serviceName ?? "Service"}
              </span>
              <span className="truncate text-[10px] text-slate-300">
                {formatTimeRange(b.startsAt, b.endsAt)}
              </span>
            </button>
          );
        });
      })}
    </div>
  );
}

export type DayWeekNavigatorProps = {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  anchorDate: Date;
  onAnchorChange: (date: Date) => void;
  weekStartsOn?: Weekday;
  locale?: string;
};

export function DayWeekNavigator({
  mode,
  onModeChange,
  anchorDate,
  onAnchorChange,
  weekStartsOn,
  locale,
}: DayWeekNavigatorProps) {
  const step = mode === "day" ? 1 : 7;
  const resolvedWeekStart: Weekday = weekStartsOn ?? resolveWeekStart(locale);
  const rangeLabel =
    mode === "day"
      ? formatDayLabel(anchorDate)
      : `${formatDayLabel(startOfWeek(anchorDate, resolvedWeekStart))} – ${formatDayLabel(
          addDays(startOfWeek(anchorDate, resolvedWeekStart), 6),
        )}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAnchorChange(addDays(anchorDate, -step))}
          className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => onAnchorChange(startOfDay(new Date()))}
          className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onAnchorChange(addDays(anchorDate, step))}
          className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800"
          aria-label="Next"
        >
          ›
        </button>
        <span className="ml-2 text-xs text-slate-300">{rangeLabel}</span>
      </div>
      <div className="inline-flex overflow-hidden rounded border border-slate-700 text-xs">
        <button
          type="button"
          onClick={() => onModeChange("day")}
          className={`px-3 py-1 ${
            mode === "day"
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Day
        </button>
        <button
          type="button"
          onClick={() => onModeChange("week")}
          className={`border-l border-slate-700 px-3 py-1 ${
            mode === "week"
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-900 text-slate-300 hover:bg-slate-800"
          }`}
        >
          Week
        </button>
      </div>
    </div>
  );
}
