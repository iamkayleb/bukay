import { execFileSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/app/db/prisma";
import {
  computeTodaySummaryFigures,
  getTodaySummary,
  listTodaysBookings,
  zonedDayRange,
} from "@/app/(app)/today/data";
import { TodaySummaryPanel } from "@/app/(app)/today/summary";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { renderToStaticMarkup } from "react-dom/server";

const TENANT_SLUG = "today-summary-test";

type SeedIds = {
  tenantId: string;
  serviceId: string;
  clientId: string;
};

let seed: SeedIds;

function applyMigrations() {
  const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
  execFileSync(prismaBin, ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}

async function ensureSeed(): Promise<SeedIds> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {
      name: "Today Summary Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
    create: {
      slug: TENANT_SLUG,
      name: "Today Summary Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
  });

  return runWithTenantContext({ tenantId: tenant.id }, async () => {
    const service =
      (await prisma.service.findFirst({
        where: { tenantId: tenant.id, name: "Summary Cut" },
      })) ??
      (await prisma.service.create({
        data: {
          tenantId: tenant.id,
          name: "Summary Cut",
          durationMinutes: 30,
          priceCents: 5_000_00,
          currency: "NGN",
          active: true,
        },
      }));

    const client =
      (await prisma.client.findFirst({
        where: { tenantId: tenant.id, phone: "+2348031112233" },
      })) ??
      (await prisma.client.create({
        data: {
          tenantId: tenant.id,
          name: "Summary Guest",
          phone: "+2348031112233",
        },
      }));

    return { tenantId: tenant.id, serviceId: service.id, clientId: client.id };
  });
}

async function resetTenantData(tenantId: string) {
  await runWithTenantContext({ tenantId }, async () => {
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
  });
}

async function createBookingOnly(startsAt: Date) {
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  return runWithTenantContext({ tenantId: seed.tenantId }, async () =>
    prisma.booking.create({
      data: {
        tenantId: seed.tenantId,
        clientId: seed.clientId,
        serviceId: seed.serviceId,
        startsAt,
        endsAt,
        status: "confirmed",
        slotLock: `${seed.serviceId}|${startsAt.toISOString()}`,
      },
    })
  );
}

async function createBookingWithPayment(options: {
  startsAt: Date;
  paymentStatus: "paid" | "pending";
  amountCents: number;
  paymentCreatedAt: Date;
}) {
  const endsAt = new Date(options.startsAt.getTime() + 30 * 60_000);
  return runWithTenantContext({ tenantId: seed.tenantId }, async () => {
    const booking = await prisma.booking.create({
      data: {
        tenantId: seed.tenantId,
        clientId: seed.clientId,
        serviceId: seed.serviceId,
        startsAt: options.startsAt,
        endsAt,
        status: "confirmed",
        slotLock: `${seed.serviceId}|${options.startsAt.toISOString()}`,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: seed.tenantId,
        bookingId: booking.id,
        amountCents: options.amountCents,
        currency: "NGN",
        status: options.paymentStatus,
        paidAt: options.paymentStatus === "paid" ? options.paymentCreatedAt : null,
        createdAt: options.paymentCreatedAt,
      },
    });

    return booking;
  });
}

beforeAll(async () => {
  applyMigrations();
  seed = await ensureSeed();
});

beforeEach(async () => {
  await resetTenantData(seed.tenantId);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("TodaySummaryPanel", () => {
  it("renders the three labeled figures when counts are non-zero", () => {
    const html = renderToStaticMarkup(
      TodaySummaryPanel({
        summary: {
          bookingsCount: 2,
          moneyTakenCents: 12_000_00,
          unpaidCount: 1,
          currency: "NGN",
        },
      })
    );

    expect(html).toContain("Bookings today");
    expect(html).toContain("Money taken today");
    expect(html).toContain("Unpaid today");
    expect(html).toMatch(/Bookings today[\s\S]*<dd[^>]*>\s*2\s*<\/dd>/);
    expect(html).toMatch(/Unpaid today[\s\S]*<dd[^>]*>\s*1\s*<\/dd>/);
    expect(html).toContain("₦");
  });
});

describe("computeTodaySummaryFigures", () => {
  it("returns zero for all three counts when there are no bookings", () => {
    expect(computeTodaySummaryFigures([], 0, "NGN")).toEqual({
      bookingsCount: 0,
      moneyTakenCents: 0,
      unpaidCount: 0,
      currency: "NGN",
    });
  });

  it("returns the three headline figures from bookings and paid cents", () => {
    const figures = computeTodaySummaryFigures(
      [
        { payments: [{ status: "paid" }] },
        { payments: [{ status: "pending" }] },
        { payments: [] },
      ],
      25_000_00,
      "NGN"
    );

    expect(figures).toEqual({
      bookingsCount: 3,
      moneyTakenCents: 25_000_00,
      unpaidCount: 2,
      currency: "NGN",
    });
  });
});

describe("getTodaySummary", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");

  it("returns bookingsCount, moneyTakenCents, and unpaidCount on the summary object", async () => {
    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary).toEqual({
      bookingsCount: 0,
      moneyTakenCents: 0,
      unpaidCount: 0,
      currency: "NGN",
    });
  });

  it("returns the tenant timezone used for the day window", async () => {
    const { timeZone, summary } = await getTodaySummary(seed.tenantId, now);

    expect(timeZone).toBe("Africa/Lagos");
    expect(summary.currency).toBe("NGN");
  });
});

describe("today summary", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");

  it("keeps summary bookingsCount aligned with listTodaysBookings for the same day window", async () => {
    await createBookingWithPayment({
      startsAt: new Date("2026-10-04T10:00:00.000Z"),
      paymentStatus: "paid",
      amountCents: 5_000_00,
      paymentCreatedAt: new Date("2026-10-04T10:15:00.000Z"),
    });
    await createBookingOnly(new Date("2026-10-04T16:00:00.000Z"));

    const [{ bookings }, { summary }] = await Promise.all([
      listTodaysBookings(seed.tenantId, now),
      getTodaySummary(seed.tenantId, now),
    ]);

    expect(summary.bookingsCount).toBe(bookings.length);
    expect(summary.bookingsCount).toBe(2);
  });

  it("[AC-2] returns bookingsCount 1 for a single booking on the tenant day (real database)", async () => {
    await createBookingWithPayment({
      startsAt: new Date("2026-10-04T10:00:00.000Z"),
      paymentStatus: "paid",
      amountCents: 5_000_00,
      paymentCreatedAt: new Date("2026-10-04T10:15:00.000Z"),
    });

    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary.bookingsCount).toBe(1);
  });

  it("returns booking count, paid cents created today, and unpaid count from getTodaySummary", async () => {
    await createBookingWithPayment({
      startsAt: new Date("2026-10-04T09:00:00.000Z"),
      paymentStatus: "paid",
      amountCents: 7_500_00,
      paymentCreatedAt: new Date("2026-10-04T09:30:00.000Z"),
    });
    await createBookingOnly(new Date("2026-10-04T15:00:00.000Z"));

    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary).toMatchObject({
      bookingsCount: 2,
      moneyTakenCents: 7_500_00,
      unpaidCount: 1,
      currency: "NGN",
    });
  });

  it("returns counts for bookings and payments in the tenant day window", async () => {
    const paidStart = new Date("2026-10-04T10:00:00.000Z");
    const pendingStart = new Date("2026-10-04T15:00:00.000Z");
    const paymentCreated = new Date("2026-10-04T11:00:00.000Z");

    await createBookingWithPayment({
      startsAt: paidStart,
      paymentStatus: "paid",
      amountCents: 12_000_00,
      paymentCreatedAt: paymentCreated,
    });
    await createBookingWithPayment({
      startsAt: pendingStart,
      paymentStatus: "pending",
      amountCents: 8_000_00,
      paymentCreatedAt: paymentCreated,
    });

    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary.bookingsCount).toBe(2);
    expect(summary.moneyTakenCents).toBe(12_000_00);
    expect(summary.unpaidCount).toBe(1);
    expect(summary.currency).toBe("NGN");
  });

  it("[AC-3] returns zero figures on a day with no bookings", async () => {
    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary).toEqual({
      bookingsCount: 0,
      moneyTakenCents: 0,
      unpaidCount: 0,
      currency: "NGN",
    });

    const html = renderToStaticMarkup(
      TodaySummaryPanel({
        summary,
      })
    );
    expect(html).toContain("Bookings today");
    expect(html).toContain("Money taken today");
    expect(html).toContain("Unpaid today");
    expect(html).toMatch(/>\s*0\s*</);
  });

  it("excludes bookings outside the timezone day boundary", async () => {
    const range = zonedDayRange("Africa/Lagos", now);
    await createBookingWithPayment({
      startsAt: new Date(range.start.getTime() - 60_000),
      paymentStatus: "paid",
      amountCents: 3_000_00,
      paymentCreatedAt: new Date(range.start.getTime() - 30_000),
    });
    await createBookingWithPayment({
      startsAt: new Date(range.end.getTime()),
      paymentStatus: "paid",
      amountCents: 4_000_00,
      paymentCreatedAt: new Date(range.end.getTime() + 30_000),
    });
    await createBookingWithPayment({
      startsAt: new Date("2026-10-04T14:00:00.000Z"),
      paymentStatus: "paid",
      amountCents: 5_000_00,
      paymentCreatedAt: new Date("2026-10-04T13:00:00.000Z"),
    });

    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary.bookingsCount).toBe(1);
    expect(summary.moneyTakenCents).toBe(5_000_00);
    expect(summary.unpaidCount).toBe(0);
  });

  it("counts bookings with no payment toward unpaid", async () => {
    await createBookingOnly(new Date("2026-10-04T11:00:00.000Z"));

    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary.bookingsCount).toBe(1);
    expect(summary.moneyTakenCents).toBe(0);
    expect(summary.unpaidCount).toBe(1);
  });

  it("[AC-4] counts pending payments toward unpaid, not money taken", async () => {
    const startsAt = new Date("2026-10-04T09:30:00.000Z");
    await createBookingWithPayment({
      startsAt,
      paymentStatus: "pending",
      amountCents: 15_000_00,
      paymentCreatedAt: new Date("2026-10-04T09:45:00.000Z"),
    });

    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary.bookingsCount).toBe(1);
    expect(summary.moneyTakenCents).toBe(0);
    expect(summary.unpaidCount).toBe(1);
  });

  it("sums money taken only from paid payments created on the tenant day, not by booking time", async () => {
    await createBookingWithPayment({
      startsAt: new Date("2026-10-04T14:00:00.000Z"),
      paymentStatus: "paid",
      amountCents: 9_000_00,
      paymentCreatedAt: new Date("2026-10-03T22:30:00.000Z"),
    });

    const { summary } = await getTodaySummary(seed.tenantId, now);

    expect(summary.bookingsCount).toBe(1);
    expect(summary.moneyTakenCents).toBe(0);
    expect(summary.unpaidCount).toBe(0);
  });
});