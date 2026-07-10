import { describe, it, expect } from "vitest";
import {
  findConflictingBookings,
  hasConflictingBooking,
  intervalsOverlap,
  overlapsAny,
  type BookingOverlapPrisma,
} from "@/app/lib/booking/overlap";

type StoredBooking = {
  id: string;
  tenantId: string;
  startsAt: Date;
  endsAt: Date;
  staffId: string | null;
  status: string;
};

// Minimal in-memory stub that mirrors the small slice of Prisma the overlap
// helper touches. We express the SQL-level overlap conditions here so the
// tests exercise the exact filter shape the helper builds.
function stubClient(rows: StoredBooking[]): BookingOverlapPrisma {
  return {
    booking: {
      async findMany({ where, select }) {
        void select;
        return rows
          .filter((r) => {
            if (r.tenantId !== where.tenantId) return false;
            if (where.status && r.status === (where.status as { not: string }).not) return false;
            if (where.startsAt?.lt && !(r.startsAt < where.startsAt.lt)) return false;
            if (where.endsAt?.gt && !(r.endsAt > where.endsAt.gt)) return false;
            if (where.id && r.id === (where.id as { not: string }).not) return false;
            if (where.staffId !== undefined && r.staffId !== where.staffId) return false;
            return true;
          })
          .map((r) => ({
            id: r.id,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            staffId: r.staffId,
            status: r.status,
          }));
      },
    },
  };
}

const d = (iso: string) => new Date(iso);

describe("intervalsOverlap (interval overlap semantics)", () => {
  it("returns true when the new booking starts before the window and overlaps it", () => {
    // The window is 09:00–17:00. The candidate starts at 08:30 and runs
    // until 09:30 — it starts BEFORE the window but its interior still
    // intersects the window. The old less-than-or-equal boundary check
    // (startsAt <= windowStart) missed this case; the new
    // startsAt < windowEnd && endsAt > windowStart form catches it.
    const window = { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T17:00:00Z") };
    const candidate = { startsAt: d("2026-07-10T08:30:00Z"), endsAt: d("2026-07-10T09:30:00Z") };
    expect(intervalsOverlap(candidate, window)).toBe(true);
  });

  it("returns true when the new booking ends after the window and overlaps it", () => {
    const window = { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T10:00:00Z") };
    const candidate = { startsAt: d("2026-07-10T09:30:00Z"), endsAt: d("2026-07-10T11:00:00Z") };
    expect(intervalsOverlap(candidate, window)).toBe(true);
  });

  it("returns true when the new booking fully contains the window", () => {
    const window = { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T10:00:00Z") };
    const candidate = { startsAt: d("2026-07-10T08:00:00Z"), endsAt: d("2026-07-10T11:00:00Z") };
    expect(intervalsOverlap(candidate, window)).toBe(true);
  });

  it("returns true when the new booking is fully contained inside the window", () => {
    const window = { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T17:00:00Z") };
    const candidate = { startsAt: d("2026-07-10T10:00:00Z"), endsAt: d("2026-07-10T11:00:00Z") };
    expect(intervalsOverlap(candidate, window)).toBe(true);
  });

  it("returns false when the new booking is entirely before the window", () => {
    const window = { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T17:00:00Z") };
    const candidate = { startsAt: d("2026-07-10T07:00:00Z"), endsAt: d("2026-07-10T09:00:00Z") };
    expect(intervalsOverlap(candidate, window)).toBe(false);
  });

  it("returns false when the new booking is entirely after the window", () => {
    const window = { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T17:00:00Z") };
    const candidate = { startsAt: d("2026-07-10T17:00:00Z"), endsAt: d("2026-07-10T18:00:00Z") };
    expect(intervalsOverlap(candidate, window)).toBe(false);
  });

  it("treats abutting intervals as non-overlapping (half-open semantics)", () => {
    // [09:00, 10:00) followed by [10:00, 11:00) — a booking that ends at
    // exactly 10:00 does not conflict with one that starts at 10:00.
    const first = { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T10:00:00Z") };
    const second = { startsAt: d("2026-07-10T10:00:00Z"), endsAt: d("2026-07-10T11:00:00Z") };
    expect(intervalsOverlap(first, second)).toBe(false);
    expect(intervalsOverlap(second, first)).toBe(false);
  });
});

describe("overlapsAny", () => {
  it("returns true if any existing booking overlaps", () => {
    const candidate = { startsAt: d("2026-07-10T08:30:00Z"), endsAt: d("2026-07-10T09:30:00Z") };
    const existing = [
      { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T10:00:00Z") },
      { startsAt: d("2026-07-10T13:00:00Z"), endsAt: d("2026-07-10T14:00:00Z") },
    ];
    expect(overlapsAny(candidate, existing)).toBe(true);
  });

  it("returns false when no existing booking overlaps", () => {
    const candidate = { startsAt: d("2026-07-10T12:00:00Z"), endsAt: d("2026-07-10T12:30:00Z") };
    const existing = [
      { startsAt: d("2026-07-10T09:00:00Z"), endsAt: d("2026-07-10T10:00:00Z") },
      { startsAt: d("2026-07-10T13:00:00Z"), endsAt: d("2026-07-10T14:00:00Z") },
    ];
    expect(overlapsAny(candidate, existing)).toBe(false);
  });
});

describe("findConflictingBookings (Prisma layer)", () => {
  const tenantId = "t1";

  const seed: StoredBooking[] = [
    {
      id: "b1",
      tenantId,
      startsAt: d("2026-07-10T09:00:00Z"),
      endsAt: d("2026-07-10T10:00:00Z"),
      staffId: "s1",
      status: "confirmed",
    },
    {
      id: "b2",
      tenantId,
      startsAt: d("2026-07-10T10:00:00Z"),
      endsAt: d("2026-07-10T11:00:00Z"),
      staffId: "s1",
      status: "confirmed",
    },
    {
      id: "b3",
      tenantId,
      startsAt: d("2026-07-10T09:00:00Z"),
      endsAt: d("2026-07-10T10:00:00Z"),
      staffId: "s2",
      status: "cancelled",
    },
    {
      id: "b4",
      tenantId: "otherTenant",
      startsAt: d("2026-07-10T09:00:00Z"),
      endsAt: d("2026-07-10T10:00:00Z"),
      staffId: null,
      status: "confirmed",
    },
  ];

  it("finds a booking that overlaps a candidate starting before the window", async () => {
    const client = stubClient(seed);
    const conflicts = await findConflictingBookings(
      {
        tenantId,
        startsAt: d("2026-07-10T08:30:00Z"),
        endsAt: d("2026-07-10T09:30:00Z"),
      },
      client
    );
    expect(conflicts.map((c) => c.id)).toEqual(["b1"]);
  });

  it("does not treat abutting bookings as conflicts", async () => {
    const client = stubClient(seed);
    // The candidate ends exactly when b2 begins.
    const conflicts = await findConflictingBookings(
      {
        tenantId,
        startsAt: d("2026-07-10T08:00:00Z"),
        endsAt: d("2026-07-10T09:00:00Z"),
      },
      client
    );
    // b1 starts at 09:00 → no overlap; b2 starts at 10:00 → no overlap.
    expect(conflicts).toEqual([]);
  });

  it("excludes cancelled bookings", async () => {
    const client = stubClient(seed);
    const conflicts = await findConflictingBookings(
      {
        tenantId,
        startsAt: d("2026-07-10T09:15:00Z"),
        endsAt: d("2026-07-10T09:45:00Z"),
        staffId: "s2",
      },
      client
    );
    // b3 would overlap on the wall clock but is cancelled.
    expect(conflicts).toEqual([]);
  });

  it("excludes bookings for other tenants", async () => {
    const client = stubClient(seed);
    const conflicts = await findConflictingBookings(
      {
        tenantId,
        startsAt: d("2026-07-10T09:15:00Z"),
        endsAt: d("2026-07-10T09:45:00Z"),
      },
      client
    );
    expect(conflicts.every((c) => c.id !== "b4")).toBe(true);
  });

  it("ignores the excluded booking id (reschedule case)", async () => {
    const client = stubClient(seed);
    const conflicts = await findConflictingBookings(
      {
        tenantId,
        startsAt: d("2026-07-10T09:00:00Z"),
        endsAt: d("2026-07-10T10:00:00Z"),
        excludeBookingId: "b1",
      },
      client
    );
    expect(conflicts.map((c) => c.id)).toEqual([]);
  });

  it("hasConflictingBooking is true when any conflict exists", async () => {
    const client = stubClient(seed);
    const conflict = await hasConflictingBooking(
      {
        tenantId,
        startsAt: d("2026-07-10T08:30:00Z"),
        endsAt: d("2026-07-10T09:30:00Z"),
      },
      client
    );
    expect(conflict).toBe(true);
  });
});
