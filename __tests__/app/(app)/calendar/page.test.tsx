// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CalendarPage from "@/app/(app)/calendar/page";
import {
  calendarAddBookingHref,
  merchantEmptyHrefs,
  merchantEmptyMessages,
} from "@/app/(app)/merchant-empty-copy";
import { renderDayViewHtml } from "../helpers/render-day-view";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  tenantFindUnique: vi.fn(),
  serviceFindMany: vi.fn(),
  clientFindMany: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => state.headers.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: (...args: unknown[]) => state.tenantFindUnique(...args),
    },
    service: {
      findMany: (...args: unknown[]) => state.serviceFindMany(...args),
    },
    client: {
      findMany: (...args: unknown[]) => state.clientFindMany(...args),
    },
  },
}));

function signInAs(tenantId: string) {
  state.headers.set("x-tenant-id", tenantId);
}

beforeEach(() => {
  state.headers.clear();
  state.tenantFindUnique.mockReset();
  state.serviceFindMany.mockReset();
  state.clientFindMany.mockReset();
  state.tenantFindUnique.mockResolvedValue({ timezone: "Africa/Lagos" });
  state.serviceFindMany.mockResolvedValue([]);
  state.clientFindMany.mockResolvedValue([]);
});

describe("CalendarPage", () => {
  it("task #556: empty day copy links to the new-booking anchor on this page", async () => {
    signInAs("tenant-empty");

    const pageHtml = renderToStaticMarkup(await CalendarPage());
    const dayHtml = await renderDayViewHtml([]);

    expect(dayHtml).toContain(merchantEmptyMessages.calendarDay);
    expect(dayHtml).toContain(`href="${calendarAddBookingHref("2026-10-04")}"`);
    expect(pageHtml).toContain('id="new-booking"');
  });

  it("exposes the new-booking anchor that day-view empty copy links to", async () => {
    signInAs("tenant-empty");

    const html = renderToStaticMarkup(await CalendarPage());

    expect(html).toContain('id="new-booking"');
    expect(html).toContain("scroll-mt-8");
    expect(merchantEmptyHrefs.calendarAddBooking).toBe("#new-booking");
    expect(html).toContain("Calendar");
  });

  it("still renders the booking form when the tenant has services and clients", async () => {
    signInAs("tenant-demo");
    state.serviceFindMany.mockResolvedValue([{ id: "svc-1", name: "Classic Haircut" }]);
    state.clientFindMany.mockResolvedValue([{ id: "client-1", name: "Ada Okonkwo" }]);

    const html = renderToStaticMarkup(await CalendarPage());

    expect(html).toContain('id="new-booking"');
    expect(html).toContain("Classic Haircut");
    expect(html).toContain("Ada Okonkwo");
  });
});