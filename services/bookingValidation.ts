export type BookingInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type BookingRecord = BookingInterval & {
  id: string;
  tenantId: string;
  staffId: string | null;
};

export type BusinessHourRecord = {
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export type BookingValidationIssue =
  | {
      code: "OUTSIDE_BUSINESS_HOURS";
      status: 400;
      message: string;
    }
  | {
      code: "BOOKING_OVERLAP";
      status: 409;
      message: string;
    };

export type BookingValidationStore = {
  findBusinessHours(args: {
    tenantId: string;
    dayOfWeek: number;
    staffId: string | null;
  }): Promise<BusinessHourRecord | null>;
  hasBlackoutDate(args: {
    tenantId: string;
    date: string;
    staffId: string | null;
  }): Promise<boolean>;
  findOverlappingBooking(args: {
    tenantId: string;
    bookingId: string;
    staffId: string | null;
    startsAt: Date;
    endsAt: Date;
  }): Promise<BookingRecord | null>;
};

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function mergeBookingInterval(
  existing: BookingInterval,
  update: Partial<BookingInterval>
): BookingInterval {
  return {
    startsAt: update.startsAt ?? existing.startsAt,
    endsAt: update.endsAt ?? existing.endsAt,
  };
}

export async function validateBookingInterval(
  store: BookingValidationStore,
  existing: BookingRecord,
  candidate: BookingInterval & { staffId?: string | null }
): Promise<BookingValidationIssue | null> {
  const staffId = candidate.staffId ?? existing.staffId;
  const intervalIssue = validateIntervalShape(candidate);
  if (intervalIssue) {
    return intervalIssue;
  }

  const businessHoursIssue = await validateBusinessHours(store, {
    tenantId: existing.tenantId,
    staffId,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
  });
  if (businessHoursIssue) {
    return businessHoursIssue;
  }

  if (staffId) {
    const overlappingBooking = await store.findOverlappingBooking({
      tenantId: existing.tenantId,
      bookingId: existing.id,
      staffId,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
    });
    if (overlappingBooking) {
      return {
        code: "BOOKING_OVERLAP",
        status: 409,
        message: "Booking overlaps with another booking for the selected time.",
      };
    }
  }

  return null;
}

function validateIntervalShape(interval: BookingInterval): BookingValidationIssue | null {
  if (interval.endsAt <= interval.startsAt) {
    return {
      code: "OUTSIDE_BUSINESS_HOURS",
      status: 400,
      message: "Booking end time must be after the start time.",
    };
  }

  if (toUtcDateKey(interval.startsAt) !== toUtcDateKey(interval.endsAt)) {
    return {
      code: "OUTSIDE_BUSINESS_HOURS",
      status: 400,
      message: "Booking must start and end on the same business day.",
    };
  }

  return null;
}

async function validateBusinessHours(
  store: BookingValidationStore,
  interval: BookingInterval & { tenantId: string; staffId: string | null }
): Promise<BookingValidationIssue | null> {
  const date = toUtcDateKey(interval.startsAt);
  const hasBlackoutDate = await store.hasBlackoutDate({
    tenantId: interval.tenantId,
    staffId: interval.staffId,
    date,
  });
  if (hasBlackoutDate) {
    return {
      code: "OUTSIDE_BUSINESS_HOURS",
      status: 400,
      message: "Booking falls on a blackout date.",
    };
  }

  const businessHours = await store.findBusinessHours({
    tenantId: interval.tenantId,
    staffId: interval.staffId,
    dayOfWeek: interval.startsAt.getUTCDay(),
  });
  if (!businessHours || businessHours.isClosed) {
    return {
      code: "OUTSIDE_BUSINESS_HOURS",
      status: 400,
      message: "Booking falls outside configured business hours.",
    };
  }

  const opensAt = parseClockMinutes(businessHours.opensAt);
  const closesAt = parseClockMinutes(businessHours.closesAt);
  if (opensAt === null || closesAt === null || closesAt <= opensAt) {
    return {
      code: "OUTSIDE_BUSINESS_HOURS",
      status: 400,
      message: "Configured business hours are invalid for this day.",
    };
  }

  const startMinute = interval.startsAt.getUTCHours() * 60 + interval.startsAt.getUTCMinutes();
  const endMinute = interval.endsAt.getUTCHours() * 60 + interval.endsAt.getUTCMinutes();
  if (startMinute < opensAt || endMinute > closesAt) {
    return {
      code: "OUTSIDE_BUSINESS_HOURS",
      status: 400,
      message: "Booking falls outside configured business hours.",
    };
  }

  return null;
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

function toUtcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
