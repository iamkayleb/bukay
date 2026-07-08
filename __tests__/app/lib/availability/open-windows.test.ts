import { describe, expect, it, vi } from "vitest";
import {
  computeOpenWindows,
  getOpenWindows,
  type BlackoutRow,
  type BusinessHourRow,
  type OpenWindowsPrisma,
} from "@/app/lib/availability/open-windows";

const LAGOS = "Africa/Lagos";

// 2026-06-15 is a Monday in Africa/Lagos (UTC+1 year-round).
const MON_2026_06_15 = new Date("2026-06-15T09:30:00.000Z");
// 2026-06-14 is a Sunday.
const SUN_2026_06_14 = new Date("2026-06-14T09:30:00.000Z");

function hour(dayOfWeek: number, opensAt: string, closesAt: string): BusinessHourRow {
  return { dayOfWeek, opensAt, closesAt };
}

describe("computeOpenWindows", () => {
  it("returns a single window for a straight weekday schedule", () => {
    const windows = computeOpenWindows({
      date: MON_2026_06_15,
      timezone: LAGOS,
      hours: [hour(1, "09:00", "18:00")],
      blackouts: [],
    });

    expect(windows).toHaveLength(1);
    // Lagos is UTC+1, so 09:00 wall-clock === 08:00 UTC.
    expect(windows[0].opensAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
    expect(windows[0].closesAt.toISOString()).toBe("2026-06-15T17:00:00.000Z");
  });

  it("supports multiple open→close windows on the same weekday", () => {
    const windows = computeOpenWindows({
      date: MON_2026_06_15,
      timezone: LAGOS,
      hours: [hour(1, "14:00", "18:00"), hour(1, "09:00", "13:00")],
      blackouts: [],
    });

    expect(windows).toHaveLength(2);
    // Result must be sorted by opensAt regardless of input order.
    expect(windows[0].opensAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
    expect(windows[0].closesAt.toISOString()).toBe("2026-06-15T12:00:00.000Z");
    expect(windows[1].opensAt.toISOString()).toBe("2026-06-15T13:00:00.000Z");
    expect(windows[1].closesAt.toISOString()).toBe("2026-06-15T17:00:00.000Z");
  });

  it("returns no windows when the date matches a blackout", () => {
    const windows = computeOpenWindows({
      date: MON_2026_06_15,
      timezone: LAGOS,
      hours: [hour(1, "09:00", "18:00")],
      blackouts: [{ date: "2026-06-15" }],
    });

    expect(windows).toEqual([]);
  });

  it("ignores rows for other weekdays and rows flagged isClosed", () => {
    const windows = computeOpenWindows({
      date: MON_2026_06_15,
      timezone: LAGOS,
      hours: [
        hour(0, "10:00", "16:00"), // Sunday — skipped
        { ...hour(1, "09:00", "18:00"), isClosed: true }, // Monday but closed
        hour(2, "09:00", "18:00"), // Tuesday — skipped
      ],
      blackouts: [],
    });

    expect(windows).toEqual([]);
  });

  it("drops windows whose close time is not after the open time", () => {
    const windows = computeOpenWindows({
      date: MON_2026_06_15,
      timezone: LAGOS,
      hours: [hour(1, "12:00", "12:00"), hour(1, "18:00", "09:00")],
      blackouts: [],
    });

    expect(windows).toEqual([]);
  });

  it("rejects malformed time strings", () => {
    expect(() =>
      computeOpenWindows({
        date: MON_2026_06_15,
        timezone: LAGOS,
        hours: [hour(1, "9am", "5pm")],
        blackouts: [],
      })
    ).toThrow(/invalid time/i);
  });

  it("returns nothing for a weekday with no matching rows", () => {
    const windows = computeOpenWindows({
      date: SUN_2026_06_14,
      timezone: LAGOS,
      hours: [hour(1, "09:00", "18:00")],
      blackouts: [],
    });

    expect(windows).toEqual([]);
  });

  it("uses the tenant timezone for the weekday lookup", () => {
    // 2026-06-15T00:30:00.000Z is Sunday in UTC but Monday in Africa/Lagos
    // (UTC+1). Confirms we resolve the weekday in the tenant zone, not UTC.
    const nearMidnightUtc = new Date("2026-06-15T00:30:00.000Z");
    const windows = computeOpenWindows({
      date: nearMidnightUtc,
      timezone: LAGOS,
      hours: [hour(1, "09:00", "18:00")], // Monday-only rule
      blackouts: [],
    });

    expect(windows).toHaveLength(1);
    expect(windows[0].opensAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
  });

  it("produces windows that span the same duration all year in a DST-free zone", () => {
    // Africa/Lagos is UTC+1 year-round, so a 09:00–18:00 window is always
    // exactly 9 hours regardless of season — no DST spring-forward/fall-back.
    const januaryMonday = new Date("2026-01-05T12:00:00.000Z"); // Mon 2026-01-05
    const julyMonday = new Date("2026-07-06T12:00:00.000Z"); // Mon 2026-07-06

    const janWindows = computeOpenWindows({
      date: januaryMonday,
      timezone: LAGOS,
      hours: [hour(1, "09:00", "18:00")],
      blackouts: [],
    });
    const julWindows = computeOpenWindows({
      date: julyMonday,
      timezone: LAGOS,
      hours: [hour(1, "09:00", "18:00")],
      blackouts: [],
    });

    const janDuration = janWindows[0].closesAt.getTime() - janWindows[0].opensAt.getTime();
    const julDuration = julWindows[0].closesAt.getTime() - julWindows[0].opensAt.getTime();

    expect(janDuration).toBe(9 * 60 * 60 * 1000);
    expect(julDuration).toBe(9 * 60 * 60 * 1000);
    // Both mornings open at 09:00 Lagos time (08:00 UTC), confirming no DST
    // shift between winter and summer.
    expect(janWindows[0].opensAt.toISOString().endsWith("T08:00:00.000Z")).toBe(true);
    expect(julWindows[0].opensAt.toISOString().endsWith("T08:00:00.000Z")).toBe(true);
  });
});

function makePrismaStub(overrides: {
  timezone?: string | null;
  hours?: BusinessHourRow[];
  blackouts?: BlackoutRow[];
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
  };
}

function asPrisma(stub: ReturnType<typeof makePrismaStub>): OpenWindowsPrisma {
  return stub as unknown as OpenWindowsPrisma;
}

describe("getOpenWindows", () => {
  it("queries by the tenant weekday and calendar date, then delegates to computeOpenWindows", async () => {
    const prisma = makePrismaStub({
      hours: [hour(1, "09:00", "13:00"), hour(1, "14:00", "18:00")],
    });

    const windows = await getOpenWindows("tenant-1", MON_2026_06_15, asPrisma(prisma));

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: { timezone: true },
    });
    expect(prisma.businessHour.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", dayOfWeek: 1, isClosed: false },
    });
    expect(prisma.blackout.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", date: "2026-06-15" },
    });

    expect(windows).toHaveLength(2);
    expect(windows[0].opensAt.toISOString()).toBe("2026-06-15T08:00:00.000Z");
    expect(windows[1].opensAt.toISOString()).toBe("2026-06-15T13:00:00.000Z");
  });

  it("returns no windows when a blackout matches the calendar date", async () => {
    const prisma = makePrismaStub({
      hours: [hour(1, "09:00", "18:00")],
      blackouts: [{ date: "2026-06-15" }],
    });

    const windows = await getOpenWindows("tenant-1", MON_2026_06_15, asPrisma(prisma));
    expect(windows).toEqual([]);
  });

  it("throws when the tenant does not exist", async () => {
    const prisma = makePrismaStub({ tenantExists: false });
    await expect(getOpenWindows("missing", MON_2026_06_15, asPrisma(prisma))).rejects.toThrow(
      /tenant missing not found/i
    );
  });
});
