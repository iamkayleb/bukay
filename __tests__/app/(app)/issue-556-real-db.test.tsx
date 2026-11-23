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
import { GET as listBookings } from "@/app/api/bookings/route";
import {
  merchantEmptyActions,
  merchantEmptyHrefs,
  merchantEmptyMessages,
} from "@/app/(app)/merchant-empty-copy";

const tenantId = "issue-556-empty-db";
const timeZone = "Africa/Lagos";
const calendarDate = "2026-10-04";
const db = new PrismaClient();

vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-tenant-id": tenantId }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });
  await db.tenant.upsert({
    where: { id: tenantId },
    update: { timezone: timeZone },
    create: { id: tenantId, slug: tenantId, name: "Empty Shop", timezone: timeZone },
  });
}, 120_000);

afterAll(async () => {
  await db.booking.deleteMany({ where: { tenantId } });
  await db.payment.deleteMany({ where: { tenantId } });
  await db.client.deleteMany({ where: { tenantId } });
  await db.service.deleteMany({ where: { tenantId } });
  await db.tenant.delete({ where: { id: tenantId } });
  await db.$disconnect();
}, 120_000);

async function renderCalendarDayEmptyHtml(): Promise<string> {
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
        new NextRequest(url, { headers: { "x-tenant-id": tenantId } })
      );
      const body = await response.json();
      return { ok: response.ok, json: async () => body };
    })
  );
  vi.stubGlobal("location", {
    ...window.location,
    search: `?date=${calendarDate}`,
  });

  try {
    await act(async () => {
      root.render(<DayView tenantId={tenantId} timeZone={timeZone} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
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

  it("renders each merchant screen empty message for a tenant with no data", async () => {
    const clientsHtml = renderToStaticMarkup(await ClientsPage());
    const servicesHtml = renderToStaticMarkup(await ServicesPage());
    const paymentsHtml = renderToStaticMarkup(await PaymentsPage());
    const todayHtml = renderToStaticMarkup(await TodaySchedule({ now }));
    const calendarHtml = await renderCalendarDayEmptyHtml();

    expect(clientsHtml).toContain(merchantEmptyMessages.clients);
    expect(servicesHtml).toContain(merchantEmptyMessages.services);
    expect(paymentsHtml).toContain(merchantEmptyMessages.payments);
    expect(todayHtml).toContain(merchantEmptyMessages.today);
    expect(calendarHtml).toContain(merchantEmptyMessages.calendarDay);
    expect(calendarHtml).toContain(`href="${merchantEmptyHrefs.calendarAddBooking}"`);
    expect(calendarHtml).toContain(merchantEmptyActions.calendarAddBooking);
    expect(calendarHtml).toContain('data-testid="calendar-day-empty"');
  });
});