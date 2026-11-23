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
import { merchantEmptyMessages, MERCHANT_EMPTY_COPY } from "@/app/(app)/merchant-empty-copy";
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
    expect(html).toContain('data-testid="merchant-empty-state"');
    expect(html.indexOf('name="phone"')).toBeGreaterThan(html.indexOf(merchantEmptyMessages.clients));
  });

  it("shows calendar day empty copy with add-booking link when the day has no bookings", async () => {
    const html = await renderDayViewHtml([]);

    expect(html).toContain(merchantEmptyMessages.calendarDay);
    expect(html).toContain("No bookings on this date");
    expect(html).toContain('data-testid="calendar-add-booking-link"');
    expect(html).toContain('href="#new-booking"');
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
  });
});