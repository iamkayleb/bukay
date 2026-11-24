// @vitest-environment jsdom

/**
 * Issue #556 acceptance: empty tenant against real SQLite (not mocked Prisma).
 * Calendar DayView still loads bookings through the bookings API handler.
 */
import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ClientsPage from "@/app/(app)/clients/page";
import ServicesPage from "@/app/(app)/services/page";
import PaymentsPage from "@/app/(app)/payments/page";
import { TodaySchedule } from "@/app/(app)/today/data";
import { DayView } from "@/app/(app)/calendar/day-view";
import { waitForDayViewSettled } from "./helpers/render-day-view";
import { GET as listBookings } from "@/app/api/bookings/route";
import {
  MERCHANT_EMPTY_COPY,
  calendarAddBookingHref,
  merchantEmptyActions,
  merchantEmptyCalendarDayHeadline,
  merchantEmptyHrefs,
  merchantEmptyMessages,
} from "@/app/(app)/merchant-empty-copy";

const auth = vi.hoisted(() => ({
  tenantId: "issue-556-empty-db",
}));

const EMPTY_TENANT_ID = "issue-556-empty-db";
const DEMO_TENANT_SLUG = "demo";
const timeZone = "Africa/Lagos";
const emptyCalendarDate = "2026-10-04";
const demoBookingDate = "2026-06-15";
const db = new PrismaClient();

vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-tenant-id": auth.tenantId }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
    stdio: "pipe",
  });
  await db.tenant.upsert({
    where: { id: EMPTY_TENANT_ID },
    update: { timezone: timeZone },
    create: { id: EMPTY_TENANT_ID, slug: EMPTY_TENANT_ID, name: "Empty Shop", timezone: timeZone },
  });
}, 120_000);

afterAll(async () => {
  await db.booking.deleteMany({ where: { tenantId: EMPTY_TENANT_ID } });
  await db.payment.deleteMany({ where: { tenantId: EMPTY_TENANT_ID } });
  await db.client.deleteMany({ where: { tenantId: EMPTY_TENANT_ID } });
  await db.service.deleteMany({ where: { tenantId: EMPTY_TENANT_ID } });
  await db.tenant.delete({ where: { id: EMPTY_TENANT_ID } });
  await db.$disconnect();
}, 120_000);

async function renderCalendarDayHtml(viewTenantId: string, viewDate: string): Promise<string> {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href, "http://localhost");
      if (url.pathname !== "/api/bookings") {
        throw new Error(`unexpected fetch: ${url.pathname}`);
      }
      const response = await listBookings(
        new NextRequest(url, { headers: { "x-tenant-id": viewTenantId } })
      );
      const body = await response.json();
      return { ok: response.ok, json: async () => body };
    })
  );
  vi.stubGlobal("location", {
    ...window.location,
    search: `?date=${viewDate}`,
  });

  try {
    await act(async () => {
      root.render(<DayView tenantId={viewTenantId} timeZone={timeZone} />);
    });
    await waitForDayViewSettled(container);
    return container.innerHTML;
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  }
}

describe("issue #556 against real SQLite (empty tenant)", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");

  it("task 1: chosen date with no bookings shows guidance and a link to add one", async () => {
    auth.tenantId = EMPTY_TENANT_ID;

    const calendarHtml = await renderCalendarDayHtml(EMPTY_TENANT_ID, emptyCalendarDate);

    expect(calendarHtml).toContain("No bookings on this date");
    expect(calendarHtml).toContain(merchantEmptyMessages.calendarDay);
    expect(calendarHtml).toContain(
      `data-merchant-empty-headline="${merchantEmptyCalendarDayHeadline}"`
    );
    expect(calendarHtml).toContain(`href="${calendarAddBookingHref(emptyCalendarDate)}"`);
    expect(calendarHtml).toContain(merchantEmptyActions.calendarAddBooking);
    expect(calendarHtml).toContain('data-testid="calendar-add-booking-link"');
    expect(calendarHtml).toContain('data-testid="calendar-day-empty"');
    expect(calendarHtml).toContain('aria-labelledby="calendar-day-empty-message"');
    expect(calendarHtml).toContain('id="calendar-day-empty-message"');
    expect(calendarHtml).toContain('data-testid="merchant-empty-state"');
    expect(calendarHtml).toContain('role="status"');
    expect(calendarHtml).not.toContain('aria-label="Day bookings"');

    const messagePos = calendarHtml.indexOf(merchantEmptyMessages.calendarDay);
    const linkPos = calendarHtml.indexOf('data-testid="calendar-add-booking-link"');
    expect(messagePos).toBeGreaterThan(-1);
    expect(linkPos).toBeGreaterThan(messagePos);
  });

  it("merchant on empty tenant sees clients guidance on /clients instead of a blank page", async () => {
    auth.tenantId = EMPTY_TENANT_ID;

    const clientsHtml = renderToStaticMarkup(await ClientsPage());

    expect(clientsHtml).toContain(merchantEmptyMessages.clients);
    expect(clientsHtml).toContain('data-testid="clients-empty"');
    expect(clientsHtml).toContain('data-testid="merchant-empty-state"');
    expect(clientsHtml.indexOf('name="phone"')).toBeGreaterThan(
      clientsHtml.indexOf(merchantEmptyMessages.clients)
    );
  });

  it("renders each merchant screen empty message for a tenant with no data", async () => {
    auth.tenantId = EMPTY_TENANT_ID;

    const clientsHtml = renderToStaticMarkup(await ClientsPage());
    const servicesHtml = renderToStaticMarkup(await ServicesPage());
    const paymentsHtml = renderToStaticMarkup(await PaymentsPage());
    const todayHtml = renderToStaticMarkup(await TodaySchedule({ now }));
    const calendarHtml = await renderCalendarDayHtml(EMPTY_TENANT_ID, emptyCalendarDate);

    expect(clientsHtml).toContain(merchantEmptyMessages.clients);
    expect(servicesHtml).toContain(merchantEmptyMessages.services);
    expect(servicesHtml.indexOf('name="durationMinutes"')).toBeGreaterThan(
      servicesHtml.indexOf(merchantEmptyMessages.services)
    );
    expect(paymentsHtml).toContain(merchantEmptyMessages.payments);
    expect(todayHtml).toContain(merchantEmptyMessages.today);
    expect(todayHtml).toContain(`href="${merchantEmptyHrefs.todayCalendar}"`);
    expect(todayHtml).toContain(merchantEmptyActions.todayAddOnCalendar);
    expect(todayHtml).toContain('data-testid="today-calendar-link"');
    expect(calendarHtml).toContain(merchantEmptyMessages.calendarDay);
    expect(calendarHtml).toContain(`href="${calendarAddBookingHref(emptyCalendarDate)}"`);
    expect(calendarHtml).toContain(merchantEmptyActions.calendarAddBooking);
    expect(calendarHtml).toContain(
      `aria-label="${merchantEmptyActions.calendarAddBooking} for this date"`
    );
    expect(calendarHtml).toContain('data-testid="calendar-day-empty"');
  });
});

describe("issue #556 against real SQLite (seeded demo tenant)", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("does not show merchant empty copy when demo seed data is present", async () => {
    const demo = await db.tenant.findUnique({ where: { slug: DEMO_TENANT_SLUG } });
    expect(demo).not.toBeNull();

    auth.tenantId = demo!.id;

    const clientsHtml = renderToStaticMarkup(await ClientsPage());
    const servicesHtml = renderToStaticMarkup(await ServicesPage());
    const paymentsHtml = renderToStaticMarkup(await PaymentsPage());
    const todayHtml = renderToStaticMarkup(await TodaySchedule({ now }));
    const calendarHtml = await renderCalendarDayHtml(demo!.id, demoBookingDate);

    const pages = [clientsHtml, servicesHtml, paymentsHtml, todayHtml, calendarHtml];
    for (const html of pages) {
      for (const message of MERCHANT_EMPTY_COPY) {
        expect(html).not.toContain(message);
      }
    }

    expect(calendarHtml).toContain('aria-label="Day bookings"');
    expect(calendarHtml).not.toContain('data-testid="calendar-day-empty"');
    expect(calendarHtml).not.toContain('data-testid="calendar-add-booking-link"');
    expect(calendarHtml).not.toContain(merchantEmptyCalendarDayHeadline);
    expect(clientsHtml).toContain("Demo Client");
  });
});