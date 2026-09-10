const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface BusinessHours {
  /** 0 = Sunday .. 6 = Saturday, matching `Date#getUTCDay()`. */
  dayOfWeek: number;
  /** 24-hour "HH:MM" wall-clock time. */
  opensAt: string;
  /** 24-hour "HH:MM" wall-clock time. */
  closesAt: string;
  isClosed?: boolean;
}

export interface ExistingBooking {
  startsAt: Date;
  endsAt: Date;
  /** Buffer already attached to this booking's own service, if any. */
  bufferMinutes?: number;
}

export interface ComputeSlotsInput {
  /** Any instant on the calendar day to compute slots for. */
  date: Date;
  businessHours: BusinessHours[];
  durationMinutes: number;
  bufferMinutes?: number;
  existingBookings?: ExistingBooking[];
  /** Spacing between candidate slot start times. Defaults to 15 minutes. */
  slotIntervalMinutes?: number;
  /** Reference "current" instant. Defaults to `new Date()`. */
  now?: Date;
  /** Minimum notice required before a slot can start. Defaults to 0. */
  leadTimeMinutes?: number;
  /** Furthest a slot may start, in days from `now`. Defaults to unbounded. */
  maxAdvanceDays?: number;
}

export interface Slot {
  start: Date;
  end: Date;
}

/**
 * All Date inputs/outputs are treated as instants in a single shared
 * reference frame (the caller resolves tenant timezone beforehand); this
 * function only does UTC-based wall-clock arithmetic so results are
 * deterministic regardless of host timezone.
 */
export function computeSlots(input: ComputeSlotsInput): Slot[] {
  const {
    date,
    businessHours,
    durationMinutes,
    bufferMinutes = 0,
    existingBookings = [],
    slotIntervalMinutes = 15,
    now = new Date(),
    leadTimeMinutes = 0,
    maxAdvanceDays,
  } = input;

  if (slotIntervalMinutes <= 0) {
    throw new RangeError("slotIntervalMinutes must be greater than 0");
  }

  const hours = businessHours.find((entry) => entry.dayOfWeek === date.getUTCDay());
  if (!hours || hours.isClosed) {
    return [];
  }

  const openTime = combineDateAndTime(date, hours.opensAt);
  const closeTime = combineDateAndTime(date, hours.closesAt);
  if (closeTime.getTime() <= openTime.getTime()) {
    return [];
  }

  const earliestStartMs = now.getTime() + leadTimeMinutes * MS_PER_MINUTE;
  const latestStartMs =
    maxAdvanceDays === undefined
      ? undefined
      : now.getTime() + maxAdvanceDays * MINUTES_PER_DAY * MS_PER_MINUTE;

  const durationMs = durationMinutes * MS_PER_MINUTE;
  const bufferMs = bufferMinutes * MS_PER_MINUTE;
  const stepMs = slotIntervalMinutes * MS_PER_MINUTE;
  const closeTimeMs = closeTime.getTime();

  const busyRanges = existingBookings.map((booking) => ({
    start: booking.startsAt.getTime(),
    end: booking.endsAt.getTime() + (booking.bufferMinutes ?? 0) * MS_PER_MINUTE,
  }));

  const slots: Slot[] = [];

  for (let start = openTime.getTime(); start + durationMs <= closeTimeMs; start += stepMs) {
    if (latestStartMs !== undefined && start > latestStartMs) {
      break;
    }
    if (start < earliestStartMs) {
      continue;
    }

    const end = start + durationMs;
    const busyEnd = end + bufferMs;
    const overlapsExisting = busyRanges.some((range) => start < range.end && busyEnd > range.start);
    if (overlapsExisting) {
      continue;
    }

    slots.push({ start: new Date(start), end: new Date(end) });
  }

  return slots;
}

function combineDateAndTime(date: Date, time: string): Date {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    throw new RangeError(`Invalid time string: ${time}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes)
  );
}
