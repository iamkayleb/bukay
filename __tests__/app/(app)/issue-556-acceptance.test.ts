// @vitest-environment jsdom

/**
 * Issue #556 acceptance criteria verifiable in Vitest (no browser / full build).
 * Real-database and demo-tenant flows: e2e/merchant-empty-states.spec.ts and CI build step.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ClientsPage from "@/app/(app)/clients/page";
import PaymentsPage from "@/app/(app)/payments/page";
import ServicesPage from "@/app/(app)/services/page";
import { ServicesList } from "@/app/(app)/services/services-list";
import { TodaySchedule } from "@/app/(app)/today/data";
import {
  calendarAddBookingHref,
  merchantEmptyActions,
  merchantEmptyCalendarDayHeadline,
  merchantEmptyHrefs,
  merchantEmptyMessages,
  MERCHANT_EMPTY_COPY,
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

  it("PR task 3: clients page shows empty-tenant guidance instead of a blank list", async () => {
    state.headers.set("x-tenant-id", "tenant-empty");

    const html = renderToStaticMarkup(await ClientsPage());

    expect(html).toContain(merchantEmptyMessages.clients);
    expect(html).toContain('data-testid="clients-empty"');
    expect(html).toContain('data-testid="merchant-empty-state"');
    expect(html.indexOf('name="phone"')).toBeGreaterThan(html.indexOf(merchantEmptyMessages.clients));
  });

  it("PR task 2: services list shows empty copy above the create form", async () => {
    state.headers.set("x-tenant-id", "tenant-empty");

    const listHtml = renderToStaticMarkup(await ServicesList());
    expect(listHtml).toContain(merchantEmptyMessages.services);
    expect(listHtml).toContain('data-testid="services-empty"');

    const pageHtml = renderToStaticMarkup(await ServicesPage());
    expect(pageHtml).toContain(merchantEmptyMessages.services);
    expect(pageHtml.indexOf('name="durationMinutes"')).toBeGreaterThan(
      pageHtml.indexOf(merchantEmptyMessages.services)
    );
  });

  it("PR task 4: payments page shows empty copy when there are no payments", async () => {
    state.headers.set("x-tenant-id", "tenant-empty");
    const html = renderToStaticMarkup(await PaymentsPage());

    expect(html).toContain(merchantEmptyMessages.payments);
    expect(html).toContain('data-testid="payments-empty"');
  });

  it("PR task 5: today keeps empty copy and links merchants to /calendar", async () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    state.headers.set("x-tenant-id", "tenant-empty");

    const html = renderToStaticMarkup(await TodaySchedule({ now }));

    expect(html).toContain(merchantEmptyMessages.today);
    expect(html).toContain('data-testid="today-empty"');
    expect(html).toContain('data-testid="today-calendar-link"');
    expect(html).toContain(`href="${merchantEmptyHrefs.todayCalendar}"`);
    expect(html).toContain(merchantEmptyActions.todayAddOnCalendar);
  });

  it("PR task 1: day-view source wires calendar empty copy and add-booking link", () => {
    const source = readFileSync("app/(app)/calendar/day-view.tsx", "utf8");
    expect(source).toContain("merchantEmptyMessages.calendarDay");
    expect(source).toContain("merchantEmptyCalendarDayHeadline");
    expect(source).toContain("calendar-day-empty");
    expect(source).toContain("calendar-add-booking-link");
    expect(source).toContain("calendarAddBookingHref");
    expect(source).toContain("MerchantEmptyState");
    expect(merchantEmptyMessages.calendarDay).toContain(merchantEmptyCalendarDayHeadline);
  });

  it("PR task 1: day-view shows empty-day copy and add-booking link when the date has no bookings", async () => {
    const html = await renderDayViewHtml([]);

    expect(html).toContain(merchantEmptyMessages.calendarDay);
    expect(html).toContain(merchantEmptyCalendarDayHeadline);
    expect(html).toContain('data-testid="calendar-day-empty"');
    expect(html).toContain('data-testid="calendar-add-booking-link"');
    expect(html).toContain(`href="${calendarAddBookingHref("2026-10-04")}"`);
    expect(html).toContain(merchantEmptyActions.calendarAddBooking);
    expect(html).toContain(
      `aria-label="${merchantEmptyActions.calendarAddBooking} for this date"`
    );
    expect(merchantEmptyHrefs.calendarAddBooking).toBe("#new-booking");
    expect(html).not.toContain('aria-label="Day bookings"');

    const messagePos = html.indexOf(merchantEmptyMessages.calendarDay);
    const linkPos = html.indexOf('data-testid="calendar-add-booking-link"');
    expect(messagePos).toBeGreaterThan(-1);
    expect(linkPos).toBeGreaterThan(messagePos);
  });

  it("PR task 1: empty-day copy is exposed as MerchantEmptyState paragraph text", async () => {
    const html = await renderDayViewHtml([]);

    expect(html).toContain(`>${merchantEmptyMessages.calendarDay}<`);
    expect(html).toContain('data-testid="merchant-empty-state"');
    expect(html).toContain('role="status"');
  });

  it("PR task 6: each merchant page with an empty tenant shows its empty-state message", async () => {
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
    expect(pages.find((p) => p.name === "today")!.html).toContain('data-testid="today-empty"');
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

  it("acceptance: CI runs the merchant-empty vitest bundle and legacy placeholder grep", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    const bundle = scripts["test:merchant-empty-states"];
    expect(bundle).toContain("issue-556-acceptance.test.ts");
    expect(bundle).toContain("empty-states.test.tsx");
    expect(bundle).toContain("calendar/day-view.test.tsx");
    expect(scripts["verify:issue-556:quick"]).toContain("test:merchant-empty-states");
    expect(scripts["verify:issue-556:quick"]).toContain("Nothing here yet");
  });

  it("issue #556 PR tasks 1–6: merchant-empty vitest bundle covers each task surface", () => {
    const bundle = JSON.parse(readFileSync("package.json", "utf8")).scripts[
      "test:merchant-empty-states"
    ] as string;
    const taskSuites = [
      "calendar/day-view.test.tsx",
      "services/services-list.test.tsx",
      "services/page.test.tsx",
      "clients/page.test.tsx",
      "clients/clients-list.test.tsx",
      "payments/payments-list.test.tsx",
      "payments/page.test.tsx",
      "today/page.test.tsx",
      "empty-states.test.tsx",
    ];
    for (const suite of taskSuites) {
      expect(bundle, suite).toContain(suite);
    }
  });

  it("acceptance: CI runs merchant-empty bundle, full tests, and build", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toContain("pnpm test:merchant-empty-states");
    expect(ci).toMatch(/Nothing here yet/);
    expect(ci).toContain("pnpm build");
    expect(ci).toContain("pnpm test");
  });

  it("acceptance: verify:issue-556 local gate runs build, merchant bundle, and full vitest", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    const gate = scripts["verify:issue-556"];
    expect(gate).toContain("pnpm build");
    expect(gate).toContain("test:merchant-empty-states");
    expect(gate).toContain("pnpm vitest run");
    expect(gate).toMatch(/Nothing here yet/);
    expect(gate.indexOf("pnpm build")).toBeLessThan(gate.indexOf("pnpm vitest run"));
  });

  it("acceptance: verify:issue-556:acceptance-gate runs build, criteria tests, and legacy copy grep", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    const gate = scripts["verify:issue-556:acceptance-gate"];
    expect(gate).toContain("pnpm build");
    expect(gate).toContain("test:issue-556:acceptance-criteria");
    expect(gate).toContain("empty-states.test.tsx");
    expect(gate).toMatch(/Nothing here yet/);
    expect(gate).not.toMatch(/pnpm vitest run &&/);
    expect(gate).not.toMatch(/pnpm vitest run$/);
  });

  it("PR task 1: package exposes a focused calendar day empty-state vitest gate", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    const gate = scripts["test:issue-556:pr-task-1"];
    expect(gate).toContain("day-view.test.tsx");
    expect(gate).toContain("issue #556");
  });

  it("PR task 1: verify script chains unit and real-db calendar empty-state gates", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    const verify = scripts["verify:issue-556:pr-task-1"];
    expect(verify).toContain("test:issue-556:pr-task-1");
    expect(verify).toContain("issue-556-real-db.test.tsx");
    expect(verify).toContain("task 1");
  });

  it("PR tasks 1–6: package exposes a single vitest gate for implementation tasks", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    const gate = scripts["verify:issue-556:pr-tasks-1-6"];
    expect(gate).toContain("issue-556-acceptance.test.ts");
    expect(gate).toContain("PR task");
    expect(gate).toContain("empty-states.test.tsx");
    expect(gate).toContain("renders each page with an empty tenant");
  });

  it("acceptance: package exposes build + vitest and acceptance-criteria vitest gates", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<
      string,
      string
    >;
    const acceptanceCriteria = scripts["test:issue-556:acceptance-criteria"];
    expect(acceptanceCriteria).toContain("issue-556-acceptance.test.ts");
    expect(acceptanceCriteria).toContain("issue-556-real-db.test.tsx");
    expect(scripts["verify:issue-556"]).toContain("pnpm build");
    expect(scripts["verify:issue-556"]).toContain("pnpm vitest run");
  });

  it("PR tasks 1–5: each merchant screen wires MerchantEmptyState through merchant-empty-copy", () => {
    const screenSources: Record<string, string> = {
      calendarDay: "app/(app)/calendar/day-view.tsx",
      services: "app/(app)/services/services-list.tsx",
      clients: "app/(app)/clients/clients-list.tsx",
      payments: "app/(app)/payments/payments-list.tsx",
      today: "app/(app)/today/data.tsx",
    };

    for (const [screen, path] of Object.entries(screenSources)) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("merchant-empty-copy");
      expect(source, path).toContain("MerchantEmptyState");
      expect(source, path).toContain("merchantEmptyMessages");
      expect(source, path).toContain(`merchantEmptyMessages.${screen}`);
      expect(source).not.toContain("Nothing here yet");
    }
  });

  it("PR task 3: clients page composes the list empty state above the add form", () => {
    const pageSource = readFileSync("app/(app)/clients/page.tsx", "utf8");
    expect(pageSource).toContain("ClientsList");
    expect(pageSource).toContain("ClientForm");
    const listIndex = pageSource.indexOf("{list}");
    const formIndex = pageSource.indexOf("<ClientForm");
    expect(listIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(listIndex);
  });

  it("PR task 6: empty-states regression suite covers all five merchant screens", () => {
    const suite = readFileSync("__tests__/app/(app)/empty-states.test.tsx", "utf8");
    expect(suite).toContain(
      "renders each page with an empty tenant and asserts each message appears"
    );
    expect(suite).toContain("merchantEmptyMessages.calendarDay");
    expect(suite).toContain("merchantEmptyMessages.clients");
    expect(suite).toContain("merchantEmptyMessages.services");
    expect(suite).toContain("merchantEmptyMessages.payments");
    expect(suite).toContain("merchantEmptyMessages.today");
    expect(suite).toContain("renderDayViewHtml");
    expect(suite).toContain("ClientsPage");
    expect(suite).toContain("ServicesPage");
    expect(suite).toContain("PaymentsPage");
    expect(suite).toContain("TodaySchedule");
  });
});