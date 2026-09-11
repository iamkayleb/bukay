/** A bookable service expressed in minutes. */
export interface AvailabilityService {
  durationMinutes: number;
}

/** A previously reserved interval. `endsAt` is exclusive. */
export interface AvailabilityBooking {
  startsAt: Date;
  endsAt: Date;
}

/** Opening hours for a UTC weekday, where 0 is Sunday and 6 is Saturday. */
export interface AvailabilityHours {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed?: boolean;
}

export interface AvailabilityRange {
  /** Inclusive lower date bound. */
  start: Date;
  /** Inclusive upper date bound. */
  end: Date;
}

export interface ComputeSlotsInput {
  service: AvailabilityService;
  dateRange: AvailabilityRange;
  bookings: readonly AvailabilityBooking[];
  hours: readonly AvailabilityHours[];
  /** Slot spacing in minutes. Defaults to 30. */
  slotIntervalMinutes?: number;
  /** Supplied so the public API remains deterministic as it grows. */
  now: Date;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function minutesSinceMidnight(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function overlaps(start: number, end: number, booking: AvailabilityBooking): boolean {
  return start < booking.endsAt.getTime() && booking.startsAt.getTime() < end;
}

/**
 * Return each available appointment start in the requested UTC date range.
 *
 * A slot is placed at each interval after opening and is returned only when its
 * full service duration fits before closing and does not overlap a booking.
 * The function does not mutate its inputs or consult the system clock.
 */
export function computeSlots({
  service,
  dateRange,
  bookings,
  hours,
  slotIntervalMinutes = 30,
  now: _now,
}: ComputeSlotsInput): Date[] {
  // `now` is intentionally part of the first version of the contract. Lead
  // time and maximum-advance filtering will use this supplied value.
  void _now;

  if (
    !Number.isFinite(service.durationMinutes) ||
    service.durationMinutes <= 0 ||
    !Number.isFinite(slotIntervalMinutes) ||
    slotIntervalMinutes <= 0
  ) {
    return [];
  }

  const rangeStart = startOfUtcDay(dateRange.start);
  const rangeEnd = startOfUtcDay(dateRange.end);
  if (Number.isNaN(rangeStart) || Number.isNaN(rangeEnd) || rangeEnd < rangeStart) return [];

  const hoursByDay = new Map(hours.map((hour) => [hour.dayOfWeek, hour]));
  const durationMs = service.durationMinutes * MINUTE_MS;
  const intervalMs = slotIntervalMinutes * MINUTE_MS;
  const slots: Date[] = [];

  for (let dayStart = rangeStart; dayStart <= rangeEnd; dayStart += DAY_MS) {
    const businessHours = hoursByDay.get(new Date(dayStart).getUTCDay());
    if (!businessHours || businessHours.isClosed) continue;

    const opensMinutes = minutesSinceMidnight(businessHours.opensAt);
    const closesMinutes = minutesSinceMidnight(businessHours.closesAt);
    if (opensMinutes === null || closesMinutes === null || closesMinutes <= opensMinutes) continue;

    const opensAt = dayStart + opensMinutes * MINUTE_MS;
    const closesAt = dayStart + closesMinutes * MINUTE_MS;
    for (let startsAt = opensAt; startsAt + durationMs <= closesAt; startsAt += intervalMs) {
      const endsAt = startsAt + durationMs;
      if (!bookings.some((booking) => overlaps(startsAt, endsAt, booking))) {
        slots.push(new Date(startsAt));
      }
    }
  }

  return slots;
}
