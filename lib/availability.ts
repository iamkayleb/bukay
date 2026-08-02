export type DateInput = Date | string | number;

export type ServiceAvailability = {
  durationMinutes: number;
  slotIntervalMinutes?: number;
};

export type DateRange = {
  start: DateInput;
  end: DateInput;
};

export type ExistingBooking = {
  startsAt: DateInput;
  endsAt: DateInput;
};

export type BusinessHours = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed?: boolean;
};

export type AvailabilityBuffers = {
  beforeMinutes?: number;
  afterMinutes?: number;
};

export type RelativeWindow =
  | number
  | {
      minutes?: number;
      days?: number;
      from: DateInput;
    };

export type Slot = {
  startsAt: Date;
  endsAt: Date;
};

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export function computeSlots(
  service: ServiceAvailability,
  dateRange: DateRange,
  existingBookings: ExistingBooking[],
  hours: BusinessHours[],
  buffers: AvailabilityBuffers = {},
  leadTime?: RelativeWindow | null,
  maxAdvance?: RelativeWindow | null
): Slot[] {
  assertPositiveInteger(service.durationMinutes, "service.durationMinutes");
  const slotIntervalMinutes = service.slotIntervalMinutes ?? service.durationMinutes;
  assertPositiveInteger(slotIntervalMinutes, "service.slotIntervalMinutes");

  const rangeStart = toValidDate(dateRange.start, "dateRange.start");
  const rangeEnd = toValidDate(dateRange.end, "dateRange.end");
  if (rangeEnd <= rangeStart) {
    return [];
  }

  const beforeMs = minutesToMs(buffers.beforeMinutes ?? 0, "buffers.beforeMinutes");
  const afterMs = minutesToMs(buffers.afterMinutes ?? 0, "buffers.afterMinutes");
  const durationMs = service.durationMinutes * MINUTE_MS;
  const intervalMs = slotIntervalMinutes * MINUTE_MS;
  const earliestStart = resolveEarliestStart(leadTime);
  const latestStart = resolveLatestStart(maxAdvance);
  if (earliestStart && latestStart && earliestStart > latestStart) {
    return [];
  }

  const normalizedBookings = existingBookings
    .map((booking) => ({
      startsAt: toValidDate(booking.startsAt, "existingBookings.startsAt").getTime(),
      endsAt: toValidDate(booking.endsAt, "existingBookings.endsAt").getTime(),
    }))
    .filter((booking) => booking.endsAt > booking.startsAt)
    .sort((left, right) => left.startsAt - right.startsAt);

  const hoursByDay = new Map<number, BusinessHours>();
  for (const dayHours of hours) {
    if (!hoursByDay.has(dayHours.dayOfWeek)) {
      hoursByDay.set(dayHours.dayOfWeek, dayHours);
    }
  }

  const slots: Slot[] = [];
  for (
    let dayStart = utcDayStart(rangeStart);
    dayStart.getTime() < rangeEnd.getTime();
    dayStart = new Date(dayStart.getTime() + DAY_MS)
  ) {
    const dayHours = hoursByDay.get(dayStart.getUTCDay());
    if (!dayHours || dayHours.isClosed) {
      continue;
    }

    const openMinutes = parseClockMinutes(dayHours.opensAt);
    const closeMinutes = parseClockMinutes(dayHours.closesAt);
    if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
      continue;
    }

    const openAt = dayStart.getTime() + openMinutes * MINUTE_MS;
    const closeAt = dayStart.getTime() + closeMinutes * MINUTE_MS;
    const windowStart = Math.max(
      openAt,
      rangeStart.getTime(),
      earliestStart?.getTime() ?? Number.NEGATIVE_INFINITY
    );
    const windowEnd = Math.min(closeAt, rangeEnd.getTime());
    const latestStartMs = latestStart?.getTime() ?? Number.POSITIVE_INFINITY;

    for (
      let startMs = alignToInterval(windowStart, intervalMs);
      startMs + durationMs <= windowEnd && startMs <= latestStartMs;
      startMs += intervalMs
    ) {
      const endMs = startMs + durationMs;
      if (!overlapsAnyBooking(startMs - beforeMs, endMs + afterMs, normalizedBookings)) {
        slots.push({
          startsAt: new Date(startMs),
          endsAt: new Date(endMs),
        });
      }
    }
  }

  return slots;
}

function overlapsAnyBooking(
  blockedStart: number,
  blockedEnd: number,
  bookings: Array<{ startsAt: number; endsAt: number }>
) {
  for (const booking of bookings) {
    if (booking.startsAt >= blockedEnd) {
      return false;
    }

    if (booking.startsAt < blockedEnd && booking.endsAt > blockedStart) {
      return true;
    }
  }

  return false;
}

function resolveEarliestStart(leadTime?: RelativeWindow | null): Date | null {
  if (leadTime == null) {
    return null;
  }

  if (typeof leadTime === "number") {
    return new Date(leadTime);
  }

  return new Date(
    toValidDate(leadTime.from, "leadTime.from").getTime() +
      (leadTime.minutes ?? 0) * MINUTE_MS +
      (leadTime.days ?? 0) * DAY_MS
  );
}

function resolveLatestStart(maxAdvance?: RelativeWindow | null): Date | null {
  if (maxAdvance == null) {
    return null;
  }

  if (typeof maxAdvance === "number") {
    return new Date(maxAdvance);
  }

  return new Date(
    toValidDate(maxAdvance.from, "maxAdvance.from").getTime() +
      (maxAdvance.minutes ?? 0) * MINUTE_MS +
      (maxAdvance.days ?? 0) * DAY_MS
  );
}

function alignToInterval(value: number, intervalMs: number) {
  return Math.ceil(value / intervalMs) * intervalMs;
}

function minutesToMs(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return value * MINUTE_MS;
}

function assertPositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

function parseClockMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function toValidDate(value: DateInput, fieldName: string) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

function utcDayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
