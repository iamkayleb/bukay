// @vitest-environment jsdom

/**
 * Issue #556 acceptance criteria verifiable in Vitest (no browser / full build).
 * Real-database and demo-tenant flows: e2e/merchant-empty-states.spec.ts and CI build step.
 */
import { execSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ClientsPage from "@/app/(app)/clients/page";
import PaymentsPage from "@/app/(app)/payments/page";
import ServicesPage from "@/app/(app)/services/page";
import { TodaySchedule } from "@/app/(app)/today/data";
import {
  merchantEmptyActions,
  merchantEmptyHrefs,
  merchantEmptyMessages,
  MERCHANT_EMPTY_COPY,
} from "@/app/(app)/merchant-empty-copy";
import { renderDayViewHtml } from "./helpers/render-day-view";

/** Wording from PR task 1 (`day-view.tsx` empty chosen date). */
const PR_TASK_1_CALENDAR_SNIPPET = "No bookings on this date";

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

describe("issue #556 acceptance (vitest)", () => {
  it("removes legacy Nothing here yet placeholder copy under app/", () => {
    const matches = execSync('grep -rn "Nothing here yet" app/ || true', {
      encoding: "utf8",
    }).trim();
    expect(matches).toBe("");
  });

  it("defines empty copy for all five merchant screens", () => {
    expect(MERCHANT_EMPTY_COPY).toHaveLength(5);
    expect(MERCHANT_EMPTY_COPY).toEqual(Object.values(merchantEmptyMessages));
  });

  it("shows clients guidance on /clients for an empty tenant (not a blank list region)", async () => {
    state.headers.set("x-tenant-id", "tenant-empty");

    const html = renderToStaticMarkup(await ClientsPage());

    expect(html).toContain(merchantEmptyMessages.clients);
    expect(html).toContain('data-testid="clients-empty"');
    expect(html).toContain('data-testid="merchant-empty-state"');
    expect(html.indexOf('name="phone"')).toBeGreaterThan(html.indexOf(merchantEmptyMessages.clients));
  });

  it("PR task 1: day-view shows empty-day copy and add-booking link when the date has no bookings", async () => {
    const html = await renderDayViewHtml([]);

    expect(html).toContain(merchantEmptyMessages.calendarDay);
    expect(html).toContain(PR_TASK_1_CALENDAR_SNIPPET);
    expect(html).toContain('data-testid="calendar-day-empty"');
    expect(html).toContain('data-testid="calendar-add-booking-link"');
    expect(html).toContain(`href="${merchantEmptyHrefs.calendarAddBooking}"`);
    expect(html).toContain(merchantEmptyActions.calendarAddBooking);
    expect(merchantEmptyHrefs.calendarAddBooking).toBe("#new-booking");
    expect(html).not.toContain('aria-label="Day bookings"');
  });

  it("renders each merchant screen empty message for an empty tenant", async () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    state.headers.set("x-tenant-id", "tenant-empty");

    const pages = [
      { name: "clients", html: renderToStaticMarkup(await ClientsPage()) },
      { name: "services", html: renderToStaticMarkup(await ServicesPage()) },
      { name: "payments", html: renderToStaticMarkup(await PaymentsPage()) },
      { name: "today", html: renderToStaticMarkup(await TodaySchedule({ now })) },
      { name: "calendar", html: await renderDayViewHtml([]) },
    ];

    const messages: Record<(typeof pages)[number]["name"], string> = {
      clients: merchantEmptyMessages.clients,
      services: merchantEmptyMessages.services,
      payments: merchantEmptyMessages.payments,
      today: merchantEmptyMessages.today,
      calendar: merchantEmptyMessages.calendarDay,
    };

    for (const page of pages) {
      expect(page.html, page.name).toContain(messages[page.name]);
      expect(page.html, page.name).toContain('data-testid="merchant-empty-state"');
    }

    expect(pages.find((p) => p.name === "payments")!.html).toContain(
      'data-testid="payments-empty"'
    );
  });

  it("does not show empty copy on server-rendered screens when the tenant has data", async () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    state.headers.set("x-tenant-id", "tenant-demo");

    state.clientFindMany.mockResolvedValue([
      { id: "client-1", name: "Ada Okonkwo", phone: "+2348000000001" },
    ]);
    state.serviceFindMany.mockResolvedValue([
      {
        id: "svc-1",
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

    const pages = [
      renderToStaticMarkup(await ClientsPage()),
      renderToStaticMarkup(await ServicesPage()),
      renderToStaticMarkup(await PaymentsPage()),
      renderToStaticMarkup(await TodaySchedule({ now })),
    ];

    for (const html of pages) {
      for (const message of MERCHANT_EMPTY_COPY) {
        expect(html).not.toContain(message);
      }
    }
  });
});