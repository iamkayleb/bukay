import { getOpenWindows, type OpenWindow, type OpenWindowsPrisma } from "./open-windows";

// A bookable slot: a service-duration-sized interval that fits fully inside an
// open window and does not overlap any existing booking. Consumers of the
// booking API render these directly (e.g. as time chips on the client-facing
// calendar).
export type Slot = {
  startsAt: Date;
  endsAt: Date;
};

// Existing bookings that should be excluded from availability. Only the
// interval matters — the engine treats cancellations as absent bookings, so
// callers should filter those out before calling.
export type BookingInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type ComputeSlotsInput = {
  windows: OpenWindow[];
  durationMinutes: number;
  // How far apart consecutive slot starts should be. Defaults to
  // `durationMinutes` (back-to-back). Set larger to enforce a buffer between
  // appointments; set smaller to allow overlapping slot starts (rare).
  stepMinutes?: number;
  bookings?: BookingInterval[];
};

// Pure slot generator. For each open window, emits back-to-back candidate
// slots of `durationMinutes`, stepping forward by `stepMinutes`, and drops any
// slot that intersects an existing booking. The output is sorted by startsAt
// because the input `windows` are sorted and each window's slots are emitted
// in order.
export function computeSlots(input: ComputeSlotsInput): Slot[] {
  const { windows, durationMinutes, stepMinutes, bookings = [] } = input;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return [];
  }
  const step = stepMinutes ?? durationMinutes;
  if (!Number.isFinite(step) || step <= 0) {
    return [];
  }

  const durationMs = durationMinutes * 60_000;
  const stepMs = step * 60_000;

  const slots: Slot[] = [];
  for (const window of windows) {
    const windowEnd = window.closesAt.getTime();
    for (
      let cursor = window.opensAt.getTime();
      cursor + durationMs <= windowEnd;
      cursor += stepMs
    ) {
      const startsAt = new Date(cursor);
      const endsAt = new Date(cursor + durationMs);
      if (overlapsAny(startsAt, endsAt, bookings)) continue;
      slots.push({ startsAt, endsAt });
    }
  }
  return slots;
}

function overlapsAny(startsAt: Date, endsAt: Date, bookings: BookingInterval[]): boolean {
  const startMs = startsAt.getTime();
  const endMs = endsAt.getTime();
  for (const b of bookings) {
    if (startMs < b.endsAt.getTime() && endMs > b.startsAt.getTime()) {
      return true;
    }
  }
  return false;
}

// Prisma surface the engine relies on. Composed from the open-windows helper's
// surface plus the booking read used to exclude taken intervals. Structural so
// tests can pass a stub instead of the real client.
export type AvailabilityEnginePrisma = OpenWindowsPrisma & {
  booking: {
    findMany(args: {
      where: {
        tenantId: string;
        startsAt: { gte: Date; lt: Date };
        status: { not: string };
      };
      select: { startsAt: true; endsAt: true };
    }): Promise<BookingInterval[]>;
  };
};

export type GetAvailableSlotsOptions = {
  durationMinutes: number;
  stepMinutes?: number;
  client?: AvailabilityEnginePrisma;
};

// Availability engine entry point. Resolves the tenant's open windows for
// `date` via `getOpenWindows`, then subtracts any non-cancelled bookings that
// fall inside those windows and carves the remainder into duration-sized
// slots. Returns [] on a blackout day, a closed weekday, or when no slot fits.
export async function getAvailableSlots(
  tenantId: string,
  date: Date,
  options: GetAvailableSlotsOptions
): Promise<Slot[]> {
  const client = options.client ?? (await defaultClient());

  const windows = await getOpenWindows(tenantId, date, client);
  if (windows.length === 0) return [];

  const dayStart = windows[0].opensAt;
  const dayEnd = windows[windows.length - 1].closesAt;

  const bookings = await client.booking.findMany({
    where: {
      tenantId,
      startsAt: { gte: dayStart, lt: dayEnd },
      status: { not: "cancelled" },
    },
    select: { startsAt: true, endsAt: true },
  });

  return computeSlots({
    windows,
    durationMinutes: options.durationMinutes,
    stepMinutes: options.stepMinutes,
    bookings,
  });
}

async function defaultClient(): Promise<AvailabilityEnginePrisma> {
  const mod = await import("@/app/db/prisma");
  return mod.prisma as unknown as AvailabilityEnginePrisma;
}
