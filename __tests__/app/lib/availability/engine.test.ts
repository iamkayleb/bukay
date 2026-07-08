import { describe, expect, it, vi } from "vitest";
import {
  computeSlots,
  getAvailableSlots,
  type AvailabilityEnginePrisma,
  type BookingInterval,
} from "@/app/lib/availability/engine";
import type { BlackoutRow, BusinessHourRow, OpenWindow } from "@/app/lib/availability/open-windows";

const LAGOS = "Africa/Lagos";

// 2026-06-15 is a Monday in Africa/Lagos (UTC+1 year-round).
const MON_2026_06_15 = new Date("2026-06-15T09:30:00.000Z");

function utc(iso: string): Date {
  return new Date(iso);
}

function window(open: string, close: string): OpenWindow {
  return { opensAt: utc(open), closesAt: utc(close) };
}

describe("computeSlots", () => {
  it("carves an open window into back-to-back duration-sized slots", () => {
    const slots = computeSlots({
      windows: [window("2026-06-15T08:00:00.000Z", "2026-06-15T10:00:00.000Z")],
      durationMinutes: 30,
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-06-15T08:00:00.000Z",
      "2026-06-15T08:30:00.000Z",
      "2026-06-15T09:00:00.000Z",
      "2026-06-15T09:30:00.000Z",
    ]);
    expect(slots.every((s) => s.endsAt.getTime() - s.startsAt.getTime() === 30 * 60_000)).toBe(
      true
    );
  });

  it("drops trailing time that cannot hold a full slot", () => {
    const slots = computeSlots({
      windows: [window("2026-06-15T08:00:00.000Z", "2026-06-15T08:50:00.000Z")],
      durationMinutes: 30,
    });

    // Fits 08:00–08:30; the remaining 08:30–08:50 is only 20 minutes.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(["2026-06-15T08:00:00.000Z"]);
  });

  it("supports a step larger than the duration to enforce a buffer between slots", () => {
    const slots = computeSlots({
      windows: [window("2026-06-15T08:00:00.000Z", "2026-06-15T10:00:00.000Z")],
      durationMinutes: 30,
      stepMinutes: 45,
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-06-15T08:00:00.000Z",
      "2026-06-15T08:45:00.000Z",
      "2026-06-15T09:30:00.000Z",
    ]);
  });

  it("excludes slots that overlap an existing booking", () => {
    const bookings: BookingInterval[] = [
      { startsAt: utc("2026-06-15T08:30:00.000Z"), endsAt: utc("2026-06-15T09:00:00.000Z") },
    ];

    const slots = computeSlots({
      windows: [window("2026-06-15T08:00:00.000Z", "2026-06-15T10:00:00.000Z")],
      durationMinutes: 30,
      bookings,
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-06-15T08:00:00.000Z",
      // 08:30–09:00 collides with the booking
      "2026-06-15T09:00:00.000Z",
      "2026-06-15T09:30:00.000Z",
    ]);
  });

  it("keeps a slot that abuts a booking without overlapping it", () => {
    // Booking ends exactly when the candidate slot starts — no overlap.
    const bookings: BookingInterval[] = [
      { startsAt: utc("2026-06-15T08:00:00.000Z"), endsAt: utc("2026-06-15T08:30:00.000Z") },
    ];

    const slots = computeSlots({
      windows: [window("2026-06-15T08:30:00.000Z", "2026-06-15T09:00:00.000Z")],
      durationMinutes: 30,
      bookings,
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(["2026-06-15T08:30:00.000Z"]);
  });

  it("emits slots from every open window in a multi-window day", () => {
    const slots = computeSlots({
      windows: [
        window("2026-06-15T08:00:00.000Z", "2026-06-15T09:00:00.000Z"),
        window("2026-06-15T13:00:00.000Z", "2026-06-15T14:00:00.000Z"),
      ],
      durationMinutes: 30,
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-06-15T08:00:00.000Z",
      "2026-06-15T08:30:00.000Z",
      "2026-06-15T13:00:00.000Z",
      "2026-06-15T13:30:00.000Z",
    ]);
  });

  it("returns nothing when there are no open windows", () => {
    expect(computeSlots({ windows: [], durationMinutes: 30 })).toEqual([]);
  });

  it("returns nothing for a non-positive duration", () => {
    expect(
      computeSlots({
        windows: [window("2026-06-15T08:00:00.000Z", "2026-06-15T09:00:00.000Z")],
        durationMinutes: 0,
      })
    ).toEqual([]);
    expect(
      computeSlots({
        windows: [window("2026-06-15T08:00:00.000Z", "2026-06-15T09:00:00.000Z")],
        durationMinutes: -30,
      })
    ).toEqual([]);
  });
});

function hour(dayOfWeek: number, opensAt: string, closesAt: string): BusinessHourRow {
  return { dayOfWeek, opensAt, closesAt };
}

function makePrismaStub(overrides: {
  timezone?: string;
  hours?: BusinessHourRow[];
  blackouts?: BlackoutRow[];
  bookings?: BookingInterval[];
  tenantExists?: boolean;
}) {
  const tenantExists = overrides.tenantExists ?? true;
  return {
    tenant: {
      findUnique: vi.fn(async () =>
        tenantExists ? { timezone: overrides.timezone ?? LAGOS } : null
      ),
    },
    businessHour: {
      findMany: vi.fn(async () => overrides.hours ?? []),
    },
    blackout: {
      findMany: vi.fn(async () => overrides.blackouts ?? []),
    },
    booking: {
      findMany: vi.fn(async () => overrides.bookings ?? []),
    },
  };
}

function asPrisma(stub: ReturnType<typeof makePrismaStub>): AvailabilityEnginePrisma {
  return stub as unknown as AvailabilityEnginePrisma;
}

describe("getAvailableSlots", () => {
  it("delegates to getOpenWindows and carves the result into duration-sized slots", async () => {
    const prisma = makePrismaStub({
      hours: [hour(1, "09:00", "10:30")],
    });

    const slots = await getAvailableSlots("tenant-1", MON_2026_06_15, {
      durationMinutes: 30,
      client: asPrisma(prisma),
    });

    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        startsAt: { gte: expect.any(Date), lt: expect.any(Date) },
        status: { not: "cancelled" },
      },
      select: { startsAt: true, endsAt: true },
    });

    // 09:00 Lagos = 08:00 UTC, window is 90 min → 3 x 30-min slots.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-06-15T08:00:00.000Z",
      "2026-06-15T08:30:00.000Z",
      "2026-06-15T09:00:00.000Z",
    ]);
  });

  it("excludes slots that collide with a non-cancelled booking", async () => {
    const prisma = makePrismaStub({
      hours: [hour(1, "09:00", "10:30")],
      bookings: [
        { startsAt: utc("2026-06-15T08:30:00.000Z"), endsAt: utc("2026-06-15T09:00:00.000Z") },
      ],
    });

    const slots = await getAvailableSlots("tenant-1", MON_2026_06_15, {
      durationMinutes: 30,
      client: asPrisma(prisma),
    });

    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-06-15T08:00:00.000Z",
      "2026-06-15T09:00:00.000Z",
    ]);
  });

  it("returns [] on a blackout day without touching the booking table", async () => {
    const prisma = makePrismaStub({
      hours: [hour(1, "09:00", "18:00")],
      blackouts: [{ date: "2026-06-15" }],
    });

    const slots = await getAvailableSlots("tenant-1", MON_2026_06_15, {
      durationMinutes: 30,
      client: asPrisma(prisma),
    });

    expect(slots).toEqual([]);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns [] when the tenant is closed on the requested weekday", async () => {
    const prisma = makePrismaStub({
      // Only Tuesday hours defined; Monday has none.
      hours: [hour(2, "09:00", "18:00")],
    });

    const slots = await getAvailableSlots("tenant-1", MON_2026_06_15, {
      durationMinutes: 30,
      client: asPrisma(prisma),
    });

    expect(slots).toEqual([]);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });
});
