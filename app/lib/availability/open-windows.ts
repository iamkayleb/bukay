import { prisma as defaultPrisma } from "@/app/db/prisma";

// A concrete open→close window on a specific calendar date, materialised into
// UTC instants. Callers compose these with the booking layer to check whether
// a proposed appointment falls entirely inside an open interval.
export type OpenWindow = {
  opensAt: Date;
  closesAt: Date;
};

// Loose shape for the BusinessHour rows we care about. Kept structural so the
// pure computeOpenWindows() function can be exercised without a live Prisma
// client (see __tests__ for the unit-test surface).
export type BusinessHourRow = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed?: boolean | null;
};

// Structural equivalent for a Blackout row. The presence of a matching row for
// a (tenantId, date) pair means the tenant is fully closed that day.
export type BlackoutRow = {
  date: string;
};

export type ComputeOpenWindowsInput = {
  date: Date;
  timezone: string;
  hours: BusinessHourRow[];
  blackouts: BlackoutRow[];
};

const TIME_PATTERN = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(value: string): number {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid time "${value}"; expected HH:mm`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

// Extract the calendar date parts (year/month/day, weekday) for `date` as seen
// in `timezone`. We intentionally use Intl.DateTimeFormat so the caller can
// pass any IANA zone; for the tenant-default "Africa/Lagos" (no DST) the day
// boundaries line up cleanly, which is the guarantee this helper relies on.
function calendarParts(
  date: Date,
  timezone: string
): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  isoDate: string;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") lookup[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const dayOfWeek = weekdayMap[lookup.weekday] ?? 0;
  const isoDate = `${lookup.year}-${lookup.month}-${lookup.day}`;

  return { year, month, day, dayOfWeek, isoDate };
}

// Combine a wall-clock (year/month/day + minutes-of-day) in a given IANA zone
// into a UTC Date. Works by probing a candidate UTC instant and correcting for
// the zone's offset at that instant. Correct for zones without DST (the target
// deployment is Africa/Lagos, UTC+1 year-round).
function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  minutesOfDay: number,
  timezone: string
): Date {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;

  const probe = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const offsetMinutes = zoneOffsetMinutes(new Date(probe), timezone);
  return new Date(probe - offsetMinutes * 60_000);
}

function zoneOffsetMinutes(date: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") lookup[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour === "24" ? "0" : lookup.hour),
    Number(lookup.minute),
    Number(lookup.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}

// Pure availability core. Given the tenant's timezone, its weekly BusinessHour
// rows, and any Blackout rows for the day, resolve the open windows for
// `date`. Blackouts short-circuit to an empty list; rows flagged `isClosed`
// are ignored; and rows with `closesAt <= opensAt` are dropped (guards against
// operator typos rather than trying to model overnight windows, which the
// weekly-schedule task explicitly does not cover).
export function computeOpenWindows(input: ComputeOpenWindowsInput): OpenWindow[] {
  const { date, timezone, hours, blackouts } = input;
  const { year, month, day, dayOfWeek, isoDate } = calendarParts(date, timezone);

  if (blackouts.some((b) => b.date === isoDate)) {
    return [];
  }

  const windows: OpenWindow[] = [];
  for (const row of hours) {
    if (row.dayOfWeek !== dayOfWeek) continue;
    if (row.isClosed) continue;

    const openMinutes = parseTimeToMinutes(row.opensAt);
    const closeMinutes = parseTimeToMinutes(row.closesAt);
    if (closeMinutes <= openMinutes) continue;

    windows.push({
      opensAt: wallClockToUtc(year, month, day, openMinutes, timezone),
      closesAt: wallClockToUtc(year, month, day, closeMinutes, timezone),
    });
  }

  windows.sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());
  return windows;
}

// Minimal Prisma surface we need. Typed structurally so tests can pass a stub
// instead of the real client.
export type OpenWindowsPrisma = {
  tenant: {
    findUnique(args: {
      where: { id: string };
      select: { timezone: true };
    }): Promise<{ timezone: string } | null>;
  };
  businessHour: {
    findMany(args: {
      where: { tenantId: string; dayOfWeek: number; isClosed: false };
    }): Promise<BusinessHourRow[]>;
  };
  blackout: {
    findMany(args: { where: { tenantId: string; date: string } }): Promise<BlackoutRow[]>;
  };
};

// Resolve the open windows for one tenant on one date. Reads the tenant's
// timezone, its BusinessHour rows for the matching weekday, and any Blackout
// row for the same calendar date, then delegates to computeOpenWindows().
export async function getOpenWindows(
  tenantId: string,
  date: Date,
  client: OpenWindowsPrisma = defaultPrisma as unknown as OpenWindowsPrisma
): Promise<OpenWindow[]> {
  const tenant = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const { dayOfWeek, isoDate } = calendarParts(date, tenant.timezone);

  const [hours, blackouts] = await Promise.all([
    client.businessHour.findMany({
      where: { tenantId, dayOfWeek, isClosed: false },
    }),
    client.blackout.findMany({
      where: { tenantId, date: isoDate },
    }),
  ]);

  return computeOpenWindows({
    date,
    timezone: tenant.timezone,
    hours,
    blackouts,
  });
}
