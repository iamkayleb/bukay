import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type BookingRow = {
  id: string;
  tenantId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  client: { name: string };
  service: { name: string };
  payments?: { status: string }[];
};

type PaidPaymentRow = {
  tenantId: string;
  status: string;
  amountCents: number;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  bookings: [] as BookingRow[],
  paidPayments: [] as PaidPaymentRow[],
  timezone: "Africa/Lagos",
  findMany: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => state.headers.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    booking: {
      findMany: (...args: unknown[]) => state.findMany(...args),
      count: async (args: { where?: { tenantId?: string; startsAt?: { gte?: Date; lt?: Date } } }) => {
        const tenantId = args?.where?.tenantId;
        const gte = args?.where?.startsAt?.gte;
        const lt = args?.where?.startsAt?.lt;
        if (!tenantId || !gte || !lt) {
          return 0;
        }
        return state.bookings.filter(
          (row) =>
            row.tenantId === tenantId &&
            row.startsAt.getTime() >= gte.getTime() &&
            row.startsAt.getTime() < lt.getTime()
        ).length;
      },
    },
    payment: {
      aggregate: async (args: {
        where?: {
          tenantId?: string;
          status?: string;
          createdAt?: { gte?: Date; lt?: Date };
        };
      }) => {
        if (args?.where?.status !== "paid") {
          return { _sum: { amountCents: null } };
        }
        const tenantId = args?.where?.tenantId;
        const gte = args?.where?.createdAt?.gte;
        const lt = args?.where?.createdAt?.lt;
        const total = state.paidPayments
          .filter(
            (row) =>
              row.status === "paid" &&
              (!tenantId || row.tenantId === tenantId) &&
              (!gte || row.createdAt.getTime() >= gte.getTime()) &&
              (!lt || row.createdAt.getTime() < lt.getTime())
          )
          .reduce((sum, row) => sum + row.amountCents, 0);
        return { _sum: { amountCents: total || null } };
      },
    },
    tenant: {
      findUnique: (...args: unknown[]) => state.tenantFindUnique(...args),
    },
    service: {
      findMany: vi.fn(),
    },
  },
}));

import {
  TodaySchedule,
  getTodaySummary,
  getTodaySummaryFigures,
  listTodaysBookings,
  zonedDayRange,
} from "@/app/(app)/today/data";
import { formatPrice } from "@/app/(app)/services/services-list";
import { TEST_SESSION_SECRET, tenantSessionCookie } from "@/__tests__/helpers/tenant-auth";

function booking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "book-1",
    tenantId: "tenant-1",
    startsAt: new Date("2026-10-04T10:00:00.000Z"),
    endsAt: new Date("2026-10-04T10:30:00.000Z"),
    status: "confirmed",
    client: { name: "Ada Okonkwo" },
    service: { name: "Classic Haircut" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", TEST_SESSION_SECRET);
  state.headers.clear();
  state.bookings = [];
  state.paidPayments = [];
  state.timezone = "Africa/Lagos";
  state.findMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.tenantFindUnique.mockImplementation(async () => ({
    timezone: state.timezone,
    currency: "NGN",
  }));
  state.findMany.mockImplementation(
    async (args: { where?: { tenantId?: string; startsAt?: { gte?: Date; lt?: Date } } }) => {
      const tenantId = args?.where?.tenantId;
      const gte = args?.where?.startsAt?.gte;
      const lt = args?.where?.startsAt?.lt;
      if (!tenantId || !gte || !lt) {
        throw new Error("Booking.findMany requires tenantId and a startsAt window");
      }

      return state.bookings
        .filter(
          (row) =>
            row.tenantId === tenantId &&
            row.startsAt.getTime() >= gte.getTime() &&
            row.startsAt.getTime() < lt.getTime()
        )
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((row) => ({
          ...row,
          payments: Array.isArray((row as { payments?: unknown }).payments)
            ? (row as { payments: { status: string }[] }).payments
            : [],
        }));
    }
  );
});

describe("today bookings", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");

  it("uses the tenant timezone day window", () => {
    const range = zonedDayRange("Africa/Lagos", now);
    expect(range.start.toISOString()).toBe("2026-10-03T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-04T23:00:00.000Z");
  });

  it("[AC-2] getTodaySummary returns booking count, paid cents today, and unpaid count", async () => {
    state.paidPayments = [
      {
        tenantId: "tenant-1",
        status: "paid",
        amountCents: 5_000_00,
        createdAt: new Date("2026-10-04T11:00:00.000Z"),
      },
    ];
    state.bookings = [
      booking({ payments: [{ status: "paid" }] }),
      booking({
        id: "book-unpaid",
        startsAt: new Date("2026-10-04T16:00:00.000Z"),
        payments: [{ status: "pending" }],
      }),
    ];

    const { summary, timeZone } = await getTodaySummary("tenant-1", now);

    expect(timeZone).toBe("Africa/Lagos");
    expect(summary).toEqual({
      bookingsCount: 2,
      moneyTakenCents: 5_000_00,
      unpaidCount: 1,
      currency: "NGN",
    });
  });

  it("getTodaySummaryFigures returns booking count, paid cents, and unpaid count", async () => {
    state.paidPayments = [
      {
        tenantId: "tenant-1",
        status: "paid",
        amountCents: 5_000_00,
        createdAt: new Date("2026-10-04T11:00:00.000Z"),
      },
    ];
    state.bookings = [booking({ payments: [{ status: "paid" }] })];

    await expect(getTodaySummaryFigures("tenant-1", now)).resolves.toEqual({
      bookingsCount: 1,
      moneyTakenCents: 5_000_00,
      unpaidCount: 0,
      currency: "NGN",
    });
  });

  it("lists today's bookings for the signed-in tenant", async () => {
    state.headers.set("cookie", tenantSessionCookie("tenant-1"));
    state.bookings = [
      booking({
        id: "book-2",
        startsAt: new Date("2026-10-04T15:00:00.000Z"),
        endsAt: new Date("2026-10-04T15:20:00.000Z"),
        status: "pending",
        client: { name: "Bola Adeyemi" },
        service: { name: "Beard Trim" },
      }),
      booking(),
      booking({
        id: "book-other",
        tenantId: "tenant-2",
        client: { name: "Other Tenant Client" },
        service: { name: "Secret Facial" },
      }),
      booking({
        id: "book-yesterday",
        startsAt: new Date("2026-10-03T10:00:00.000Z"),
        endsAt: new Date("2026-10-03T10:30:00.000Z"),
        client: { name: "Yesterday Client" },
      }),
      booking({
        id: "book-tomorrow",
        startsAt: new Date("2026-10-04T23:30:00.000Z"),
        endsAt: new Date("2026-10-05T00:00:00.000Z"),
        client: { name: "Tomorrow Client" },
      }),
    ];

    const schedule = await listTodaysBookings("tenant-1", now);
    expect(schedule.bookings.map((row) => row.clientName)).toEqual(["Ada Okonkwo", "Bola Adeyemi"]);

    const html = renderToStaticMarkup(await TodaySchedule({ now }));
    expect(html).toContain("Bookings today");
    expect(html.indexOf('aria-label="Today summary"')).toBeLessThan(html.indexOf("Ada Okonkwo"));

    const summarySection = html.split('aria-label="Today summary"')[1]?.split("</dl>")[0] ?? "";
    expect(summarySection).toMatch(/Bookings today[\s\S]*<dd[^>]*>\s*2\s*<\/dd>/);
    expect(summarySection).toMatch(/Unpaid today[\s\S]*<dd[^>]*>\s*2\s*<\/dd>/);

    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("Classic Haircut");
    expect(html).toContain("Bola Adeyemi");
    expect(html).toContain("Beard Trim");
    expect(html).toContain("confirmed");
    expect(html).toContain("pending");
    expect(html.indexOf("Ada Okonkwo")).toBeLessThan(html.indexOf("Bola Adeyemi"));
    expect(html).not.toContain("Other Tenant Client");
    expect(html).not.toContain("Yesterday Client");
    expect(html).not.toContain("Tomorrow Client");
    expect(html).not.toContain("Secret Facial");
  });

  it("shows an empty state when the signed-in tenant has no bookings today", async () => {
    state.headers.set("cookie", tenantSessionCookie("tenant-empty"));
    state.bookings = [booking()];

    const html = renderToStaticMarkup(await TodaySchedule({ now }));

    expect(html).toContain("No appointments yet.");
    expect(html).not.toContain("Ada Okonkwo");
    expect(html).toContain('aria-label="Today summary"');
    const summarySection = html.split('aria-label="Today summary"')[1]?.split("</dl>")[0] ?? "";
    expect(summarySection).toMatch(/Bookings today[\s\S]*<dd[^>]*>\s*0\s*<\/dd>/);
    expect(summarySection).toContain(formatPrice(0, "NGN"));
  });

  it("shows money taken from paid payments in the summary panel", async () => {
    state.headers.set("cookie", tenantSessionCookie("tenant-1"));
    state.paidPayments = [
      {
        tenantId: "tenant-1",
        status: "paid",
        amountCents: 12_000_00,
        createdAt: new Date("2026-10-04T11:00:00.000Z"),
      },
    ];
    state.bookings = [
      booking({
        payments: [{ status: "paid" }],
      }),
    ];

    const html = renderToStaticMarkup(await TodaySchedule({ now }));
    const summarySection = html.split('aria-label="Today summary"')[1]?.split("</dl>")[0] ?? "";

    expect(summarySection).toContain(formatPrice(12_000_00, "NGN"));
    expect(summarySection).toMatch(/Bookings today[\s\S]*<dd[^>]*>\s*1\s*<\/dd>/);
    expect(summarySection).toMatch(/Unpaid today[\s\S]*<dd[^>]*>\s*0\s*<\/dd>/);
  });

  it("omits paid payments recorded outside the tenant day from money taken", async () => {
    state.headers.set("cookie", tenantSessionCookie("tenant-1"));
    state.paidPayments = [
      {
        tenantId: "tenant-1",
        status: "paid",
        amountCents: 12_000_00,
        createdAt: new Date("2026-10-03T20:00:00.000Z"),
      },
    ];
    state.bookings = [
      booking({
        payments: [{ status: "paid" }],
      }),
    ];

    const html = renderToStaticMarkup(await TodaySchedule({ now }));
    const summarySection = html.split('aria-label="Today summary"')[1]?.split("</dl>")[0] ?? "";

    expect(summarySection).toContain(formatPrice(0, "NGN"));
    expect(summarySection).toMatch(/Unpaid today[\s\S]*<dd[^>]*>\s*0\s*<\/dd>/);
  });

  it("[AC-4] counts pending payments toward unpaid, not money taken", async () => {
    state.headers.set("cookie", tenantSessionCookie("tenant-1"));
    state.paidPayments = [];
    state.bookings = [
      booking({
        payments: [{ status: "pending" }],
      }),
    ];

    const html = renderToStaticMarkup(await TodaySchedule({ now }));
    const summarySection = html.split('aria-label="Today summary"')[1]?.split("</dl>")[0] ?? "";

    expect(summarySection).toContain(formatPrice(0, "NGN"));
    expect(summarySection).toMatch(/Bookings today[\s\S]*<dd[^>]*>\s*1\s*<\/dd>/);
    expect(summarySection).toMatch(/Unpaid today[\s\S]*<dd[^>]*>\s*1\s*<\/dd>/);
  });

  it("[AC-3] shows zero summary figures while still rendering the summary section", async () => {
    state.headers.set("cookie", tenantSessionCookie("tenant-empty"));
    state.bookings = [];

    const html = renderToStaticMarkup(await TodaySchedule({ now }));

    expect(html).toContain('aria-label="Today summary"');
    expect(html).toContain("Bookings today");
    expect(html).toContain("Money taken today");
    expect(html).toContain("Unpaid today");
    expect(html).toContain("No appointments yet.");

    const summarySection = html.split('aria-label="Today summary"')[1]?.split("</dl>")[0] ?? "";
    expect(summarySection).toMatch(/>\s*0\s*</);
    expect(summarySection).toContain(formatPrice(0, "NGN"));
  });
});
