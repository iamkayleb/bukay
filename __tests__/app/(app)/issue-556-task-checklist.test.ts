// @vitest-environment jsdom

/**
 * Issue #556 — one vitest file that maps PR tasks 1–6 to verifiable renders.
 * Run: pnpm vitest run __tests__/app/(app)/issue-556-task-checklist.test.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";

import ClientsPage from "@/app/(app)/clients/page";
import PaymentsPage from "@/app/(app)/payments/page";
import ServicesPage from "@/app/(app)/services/page";
import { TodaySchedule } from "@/app/(app)/today/data";
import {
  calendarAddBookingHref,
  merchantEmptyActions,
  merchantEmptyCalendarDayHeadline,
  merchantEmptyHrefs,
  merchantEmptyMessages,
} from "@/app/(app)/merchant-empty-copy";
import { renderDayViewHtml } from "./helpers/render-day-view";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  clientFindMany: vi.fn(),
  serviceFindMany: vi.fn(),
  paymentFindMany: vi.fn(),
  bookingFindMany: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => state.headers.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    client: { findMany: (...args: unknown[]) => state.clientFindMany(...args) },
    service: { findMany: (...args: unknown[]) => state.serviceFindMany(...args) },
    payment: { findMany: (...args: unknown[]) => state.paymentFindMany(...args) },
    booking: { findMany: (...args: unknown[]) => state.bookingFindMany(...args) },
    tenant: { findUnique: (...args: unknown[]) => state.tenantFindUnique(...args) },
  },
}));

beforeEach(() => {
  state.headers.clear();
  state.headers.set("x-tenant-id", "tenant-empty");
  state.clientFindMany.mockReset();
  state.serviceFindMany.mockReset();
  state.paymentFindMany.mockReset();
  state.bookingFindMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.clientFindMany.mockResolvedValue([]);
  state.serviceFindMany.mockResolvedValue([]);
  state.paymentFindMany.mockResolvedValue([]);
  state.bookingFindMany.mockResolvedValue([]);
  state.tenantFindUnique.mockResolvedValue({ timezone: "Africa/Lagos" });
});

describe("issue #556 PR task checklist", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");
  const calendarDay = "2026-10-04";

  it("task 1: calendar day-view shows no-bookings copy and add-booking link", async () => {
    const html = await renderDayViewHtml([], { date: calendarDay });

    expect(html).toContain(merchantEmptyCalendarDayHeadline);
    expect(html).toContain(merchantEmptyMessages.calendarDay);
    expect(html).toContain(`href="${calendarAddBookingHref(calendarDay)}"`);
    expect(html).toContain(merchantEmptyActions.calendarAddBooking);
    expect(html).toContain('data-testid="calendar-day-empty"');
    expect(html).toContain(
      `data-merchant-empty-headline="${merchantEmptyCalendarDayHeadline}"`
    );
    expect(html).toContain('data-testid="calendar-add-booking-link"');
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("Loading bookings...");
    expect(html).not.toContain("Nothing here yet");
    expect(html).not.toContain('aria-label="Day bookings"');

    const messagePos = html.indexOf(merchantEmptyMessages.calendarDay);
    const linkPos = html.indexOf('data-testid="calendar-add-booking-link"');
    expect(messagePos).toBeGreaterThan(-1);
    expect(linkPos).toBeGreaterThan(messagePos);
  });

  it("task 2: services list shows empty copy above the create form on the page", async () => {
    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain(merchantEmptyMessages.services);
    expect(html.indexOf('name="durationMinutes"')).toBeGreaterThan(
      html.indexOf(merchantEmptyMessages.services)
    );
  });

  it("task 3: clients page shows empty copy above the add-client form", async () => {
    const html = renderToStaticMarkup(await ClientsPage());

    expect(html).toContain(merchantEmptyMessages.clients);
    expect(html.indexOf('name="phone"')).toBeGreaterThan(html.indexOf(merchantEmptyMessages.clients));
  });

  it("task 4: payments page shows empty copy when there are no payments", async () => {
    const html = renderToStaticMarkup(await PaymentsPage());

    expect(html).toContain(merchantEmptyMessages.payments);
    expect(html).toContain('data-testid="payments-empty"');
  });

  it("task 5: today schedule links empty merchants to the calendar", async () => {
    const html = renderToStaticMarkup(await TodaySchedule({ now }));

    expect(html).toContain(merchantEmptyMessages.today);
    expect(html).toContain(`href="${merchantEmptyHrefs.todayCalendar}"`);
    expect(html).toContain(merchantEmptyActions.todayAddOnCalendar);
  });

  it("task 6: all five screens expose their empty message for an empty tenant", async () => {
    const calendarHtml = await renderDayViewHtml([], { date: calendarDay });
    const pages = [
      renderToStaticMarkup(await ClientsPage()),
      renderToStaticMarkup(await ServicesPage()),
      renderToStaticMarkup(await PaymentsPage()),
      renderToStaticMarkup(await TodaySchedule({ now })),
      calendarHtml,
    ];

    for (const message of Object.values(merchantEmptyMessages)) {
      expect(pages.some((html) => html.includes(message))).toBe(true);
    }
  });

  it("acceptance: legacy Nothing here yet placeholder is gone from app/", () => {
    const matches = execSync('grep -rn "Nothing here yet" app/ || true', {
      encoding: "utf8",
    }).trim();
    expect(matches).toBe("");
  });

  it("acceptance: demo tenant with data does not show empty-state copy", async () => {
    state.headers.set("x-tenant-id", "tenant-demo");
    state.clientFindMany.mockResolvedValue([
      { id: "client-1", tenantId: "tenant-demo", name: "Ada Okonkwo", phone: "+2348000000001" },
    ]);
    state.serviceFindMany.mockResolvedValue([
      {
        id: "svc-1",
        tenantId: "tenant-demo",
        name: "Classic Haircut",
        description: null,
        durationMinutes: 30,
        priceCents: 5000,
        bufferMinutes: 0,
        currency: "NGN",
        active: true,
      },
    ]);
    state.paymentFindMany.mockResolvedValue([
      {
        id: "pay-1",
        amountCents: 5000,
        currency: "NGN",
        status: "paid",
        createdAt: new Date("2026-10-04T09:00:00.000Z"),
        booking: {
          client: { name: "Ada Okonkwo" },
          service: { name: "Classic Haircut" },
        },
      },
    ]);
    state.bookingFindMany.mockResolvedValue([
      {
        id: "book-1",
        startsAt: new Date("2026-10-04T10:00:00.000Z"),
        endsAt: new Date("2026-10-04T10:30:00.000Z"),
        status: "confirmed",
        client: { name: "Ada Okonkwo" },
        service: { name: "Classic Haircut" },
      },
    ]);

    const serverPages = [
      renderToStaticMarkup(await ClientsPage()),
      renderToStaticMarkup(await ServicesPage()),
      renderToStaticMarkup(await PaymentsPage()),
      renderToStaticMarkup(await TodaySchedule({ now })),
    ];

    for (const html of serverPages) {
      for (const message of Object.values(merchantEmptyMessages)) {
        expect(html).not.toContain(message);
      }
    }
    expect(serverPages[0]).toContain("Ada Okonkwo");
  });

  it("acceptance: demo tenant day view with bookings does not show empty-state copy", async () => {
    const html = await renderDayViewHtml(
      [
        {
          id: "book-1",
          startsAt: "2026-10-04T10:00:00.000Z",
          status: "confirmed",
          client: { name: "Ada Okonkwo" },
          service: { name: "Classic Haircut" },
        },
      ],
      { date: calendarDay }
    );

    for (const message of Object.values(merchantEmptyMessages)) {
      expect(html).not.toContain(message);
    }
    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain('aria-label="Day bookings"');
  });
});