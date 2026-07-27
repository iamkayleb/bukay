import { prisma as defaultPrisma } from "@/app/db/prisma";

// Half-open interval semantics: [startsAt, endsAt). A booking that ends
// exactly when another starts is NOT a conflict — this matches how the
// availability engine slices duration-sized slots back-to-back.
export type Interval = {
  startsAt: Date;
  endsAt: Date;
};

// Two intervals overlap iff each one starts before the other ends. This is
// the canonical interval-overlap test and is the shape the booking route
// must use when detecting conflicts.
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

// Same shape, flattened for the common case of testing one candidate against
// a set of existing bookings.
export function overlapsAny(candidate: Interval, existing: readonly Interval[]): boolean {
  for (const e of existing) {
    if (intervalsOverlap(candidate, e)) return true;
  }
  return false;
}

// Structural Prisma surface for `findConflictingBookings`. Structural so tests
// can pass a stub without instantiating the real client.
export type BookingOverlapPrisma = {
  booking: {
    findMany(args: {
      where: {
        tenantId: string;
        status: { not: string };
        startsAt: { lt: Date };
        endsAt: { gt: Date };
        id?: { not: string };
        staffId?: string | null;
      };
      select: {
        id: true;
        startsAt: true;
        endsAt: true;
        staffId: true;
        status: true;
      };
    }): Promise<
      Array<{
        id: string;
        startsAt: Date;
        endsAt: Date;
        staffId: string | null;
        status: string;
      }>
    >;
  };
};

export type FindConflictsInput = {
  tenantId: string;
  startsAt: Date;
  endsAt: Date;
  // When set, only bookings assigned to this staff member (or unassigned
  // bookings if null) are considered.
  staffId?: string | null;
  // Ignore this booking id when rescheduling/updating an existing booking.
  excludeBookingId?: string;
};

// Query for bookings whose interval overlaps the candidate. Uses the
// half-open overlap test at the database layer: existing.startsAt <
// candidate.endsAt AND existing.endsAt > candidate.startsAt. Cancelled
// bookings are excluded so a freshly cancelled slot can be re-booked
// immediately.
export async function findConflictingBookings(
  input: FindConflictsInput,
  client: BookingOverlapPrisma = defaultPrisma as unknown as BookingOverlapPrisma
) {
  const where: Parameters<BookingOverlapPrisma["booking"]["findMany"]>[0]["where"] = {
    tenantId: input.tenantId,
    status: { not: "cancelled" },
    startsAt: { lt: input.endsAt },
    endsAt: { gt: input.startsAt },
  };
  if (input.excludeBookingId) {
    where.id = { not: input.excludeBookingId };
  }
  if (input.staffId !== undefined) {
    where.staffId = input.staffId;
  }

  return client.booking.findMany({
    where,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      staffId: true,
      status: true,
    },
  });
}

export async function hasConflictingBooking(
  input: FindConflictsInput,
  client?: BookingOverlapPrisma
): Promise<boolean> {
  const conflicts = await findConflictingBookings(input, client);
  return conflicts.length > 0;
}
