// @vitest-environment jsdom

import { execSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CalendarPage from "@/app/(app)/calendar/page";
import { DayView } from "@/app/(app)/calendar/day-view";
import { renderDayViewHtml } from "./helpers/render-day-view";
import { PaymentsList } from "@/app/(app)/payments/payments-list";
import PaymentsPage from "@/app/(app)/payments/page";
import ClientsPage from "@/app/(app)/clients/page";
import { ClientsList } from "@/app/(app)/clients/clients-list";
import ServicesPage from "@/app/(app)/services/page";
import { ServicesList } from "@/app/(app)/services/services-list";
import {
  CLIENT_MERCHANT_EMPTY_SCREENS,
  MERCHANT_EMPTY_COPY,
  merchantEmptyActions,
  merchantEmptyHrefs,
  merchantEmptyMessages,
  SERVER_MERCHANT_EMPTY_SCREENS,
} from "@/app/(app)/merchant-empty-copy";
import { TodaySchedule } from "@/app/(app)/today/data";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  clients: [] as { id: string; tenantId: string; name: string; phone: string }[],
  services: [] as { id: string; tenantId: string; name: string }[],
  payments: [] as unknown[],
  bookings: [] as unknown[],
  timezone: "Africa/Lagos",
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
    client: {
      findMany: (...args: unknown[]) => state.clientFindMany(...args),
    },
    service: {
      findMany: (...args: unknown[]) => state.serviceFindMany(...args),
    },
    payment: {
      findMany: (...args: unknown[]) => state.paymentFindMany(...args),
    },
    booking: {
      findMany: (...args: unknown[]) => state.bookingFindMany(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => state.tenantFindUnique(...args),
    },
  },
}));

function signInAs(tenantId: string) {
  state.headers.set("x-tenant-id", tenantId);
}

beforeEach(() => {
  state.headers.clear();
  state.clients = [];
  state.services = [];
  state.payments = [];
  state.bookings = [];
  state.clientFindMany.mockReset();
  state.serviceFindMany.mockReset();
  state.paymentFindMany.mockReset();
  state.bookingFindMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.tenantFindUnique.mockImplementation(async () => ({ timezone: state.timezone }));
  state.clientFindMany.mockResolvedValue([]);
  state.serviceFindMany.mockResolvedValue([]);
  state.paymentFindMany.mockResolvedValue([]);
  state.bookingFindMany.mockResolvedValue([]);
});

describe("merchant empty states", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");

  it("renders each page with an empty tenant and asserts each message appears", async () => {
    signInAs("tenant-empty");

    const calendarHtml = await renderDayViewHtml([]);
    const todayHtml = renderToStaticMarkup(await TodaySchedule({ now }));

    const pages = [
      {
        name: "clients",
        html: renderToStaticMarkup(await ClientsPage()),
        message: merchantEmptyMessages.clients,
      },
      {
        name: "services",
        html: renderToStaticMarkup(await ServicesPage()),
        message: merchantEmptyMessages.services,
      },
      {
        name: "payments",
        html: renderToStaticMarkup(await PaymentsPage()),
        message: merchantEmptyMessages.payments,
      },
      {
        name: "today",
        html: todayHtml,
        message: merchantEmptyMessages.today,
      },
      {
        name: "calendar",
        html: calendarHtml,
        message: merchantEmptyMessages.calendarDay,
      },
    ];

    for (const page of pages) {
      expect(page.html, page.name).toContain(page.message);
    }

    expect(calendarHtml).toContain(`href="${merchantEmptyHrefs.calendarAddBooking}"`);
    expect(calendarHtml).toContain(merchantEmptyActions.calendarAddBooking);
    expect(todayHtml).toContain(`href="${merchantEmptyHrefs.todayCalendar}"`);
    expect(todayHtml).toContain(merchantEmptyActions.todayAddOnCalendar);
  });

  it("renders clients empty copy on the clients page", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await ClientsPage());
    expect(html).toContain("No clients yet — they appear here after their first booking.");
  });

  it("renders clients empty copy above the add-client form", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await ClientsPage());
    const emptyIndex = html.indexOf("No clients yet — they appear here after their first booking.");
    const formIndex = html.indexOf('name="phone"');
    expect(emptyIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(emptyIndex);
  });

  it("renders services empty copy", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await ServicesList());
    expect(html).toContain("No services yet — add your first so customers can book.");
    expect(html).toContain('role="status"');
  });

  it("renders services empty copy on the services page", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await ServicesPage());
    expect(html).toContain("No services yet — add your first so customers can book.");
  });

  it("renders services empty copy above the create form", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await ServicesPage());
    const emptyIndex = html.indexOf("No services yet — add your first so customers can book.");
    const formIndex = html.indexOf('name="durationMinutes"');
    expect(emptyIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(emptyIndex);
  });

  it("renders payments empty copy", async () => {
    const html = renderToStaticMarkup(<PaymentsList payments={[]} />);
    expect(html).toContain("No payments yet.");
  });

  it("renders payments empty copy on the payments page", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await PaymentsPage());
    expect(html).toContain("No payments yet.");
  });

  it("renders today empty copy with a calendar link", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await TodaySchedule({ now }));
    expect(html).toContain("No appointments yet.");
    expect(html).toContain(`href="${merchantEmptyHrefs.todayCalendar}"`);
    expect(html).toContain(merchantEmptyActions.todayAddOnCalendar);
    expect(html).toContain('role="status"');
  });

  it("shows the intended empty copy on each merchant page shell", async () => {
    signInAs("tenant-empty");
    const pages: { name: string; html: string; message: string }[] = [
      {
        name: "clients",
        html: renderToStaticMarkup(await ClientsPage()),
        message: "No clients yet — they appear here after their first booking.",
      },
      {
        name: "services",
        html: renderToStaticMarkup(await ServicesPage()),
        message: "No services yet — add your first so customers can book.",
      },
      {
        name: "payments",
        html: renderToStaticMarkup(await PaymentsPage()),
        message: "No payments yet.",
      },
      {
        name: "today",
        html: renderToStaticMarkup(await TodaySchedule({ now })),
        message: "No appointments yet.",
      },
    ];

    for (const page of pages) {
      expect(page.html, page.name).toContain(page.message);
    }
  });

  it("renders all server-driven empty-state copy for an empty tenant", async () => {
    signInAs("tenant-empty");
    const rendered = [
      renderToStaticMarkup(await ClientsList()),
      renderToStaticMarkup(await ServicesList()),
      renderToStaticMarkup(<PaymentsList payments={[]} />),
      renderToStaticMarkup(await TodaySchedule({ now })),
    ];
    const serverMessages = EMPTY_COPY.filter(
      (message) => message !== merchantEmptyMessages.calendarDay
    );
    for (const message of serverMessages) {
      expect(rendered.some((html) => html.includes(message))).toBe(true);
    }
  });

  it("renders the calendar new-booking form for an empty tenant", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await CalendarPage());
    expect(html).toContain("Calendar");
    expect(html).toContain('id="new-booking"');
  });

  it("does not show calendar day empty copy while bookings are loading", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });

    try {
      await act(async () => {
        root.render(<DayView tenantId="tenant-empty" timeZone="Africa/Lagos" />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.textContent).toContain("Loading bookings...");
      expect(container.textContent).not.toContain(merchantEmptyMessages.calendarDay);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ ok: true, bookings: [] }),
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.textContent).toContain(merchantEmptyMessages.calendarDay);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("renders calendar day empty copy on DayView when the day has no bookings", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, bookings: [] }),
      })
    );
    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });

    try {
      await act(async () => {
        root.render(<DayView tenantId="tenant-empty" timeZone="Africa/Lagos" />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const html = container.innerHTML;
      expect(html).toContain(merchantEmptyMessages.calendarDay);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Day schedule"');
      expect(html).toContain(`href="${merchantEmptyHrefs.calendarAddBooking}"`);
      expect(html).toContain(merchantEmptyActions.calendarAddBooking);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("clients list matches the page empty message for an empty tenant", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await ClientsList());
    expect(html).toContain("No clients yet — they appear here after their first booking.");
  });

  it("renders every merchant-screen empty message for an empty tenant", async () => {
    signInAs("tenant-empty");

    const serverPageHtml: Record<(typeof SERVER_MERCHANT_EMPTY_SCREENS)[number], string> = {
      clients: renderToStaticMarkup(await ClientsPage()),
      services: renderToStaticMarkup(await ServicesPage()),
      payments: renderToStaticMarkup(await PaymentsPage()),
      today: renderToStaticMarkup(await TodaySchedule({ now })),
    };

    for (const screen of SERVER_MERCHANT_EMPTY_SCREENS) {
      expect(serverPageHtml[screen], screen).toContain(merchantEmptyMessages[screen]);
    }

    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, bookings: [] }),
      })
    );
    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });

    try {
      await act(async () => {
        root.render(<DayView tenantId="tenant-empty" timeZone="Africa/Lagos" />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.textContent).toContain(merchantEmptyMessages.calendarDay);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

const EMPTY_COPY = MERCHANT_EMPTY_COPY;

describe("legacy placeholder copy", () => {
  it('does not use "Nothing here yet" under app/', () => {
    const matches = execSync('grep -rn "Nothing here yet" app/ || true', {
      encoding: "utf8",
    }).trim();
    expect(matches).toBe("");
  });
});

describe("empty-state copy inventory", () => {
  it("lists the five merchant-screen messages", () => {
    expect(EMPTY_COPY).toHaveLength(5);
    expect([...EMPTY_COPY]).toEqual([
      "No bookings on this date.",
      "No services yet — add your first so customers can book.",
      "No clients yet — they appear here after their first booking.",
      "No payments yet.",
      "No appointments yet.",
    ]);
  });

  it("partitions empty screens into server and client surfaces", () => {
    const allScreens = [...SERVER_MERCHANT_EMPTY_SCREENS, ...CLIENT_MERCHANT_EMPTY_SCREENS];
    expect(new Set(allScreens).size).toBe(5);
    expect(allScreens.sort()).toEqual(
      (Object.keys(merchantEmptyMessages) as (keyof typeof merchantEmptyMessages)[]).sort()
    );
  });

  it("pins empty-state navigation targets", () => {
    expect(merchantEmptyHrefs).toEqual({
      calendarAddBooking: "#new-booking",
      todayCalendar: "/calendar",
    });
  });
});

describe("populated tenant", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");

  it("does not show merchant empty copy when each screen has data", async () => {
    signInAs("tenant-demo");

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
      for (const message of EMPTY_COPY) {
        expect(html).not.toContain(message);
      }
    }

    expect(pages[0]).toContain("Ada Okonkwo");
    expect(pages[1]).toContain("Classic Haircut");
    expect(pages[2]).toContain("paid");
    expect(pages[3]).toContain("Ada Okonkwo");
  });

  it("does not show calendar day empty copy when the day has bookings", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          bookings: [
            {
              id: "book-1",
              startsAt: "2026-10-04T10:00:00.000Z",
              status: "confirmed",
              client: { name: "Ada Okonkwo" },
              service: { name: "Classic Haircut" },
            },
          ],
        }),
      })
    );
    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });

    try {
      await act(async () => {
        root.render(<DayView tenantId="tenant-demo" timeZone="Africa/Lagos" />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const html = container.innerHTML;
      expect(html).not.toContain(merchantEmptyMessages.calendarDay);
      expect(html).toContain("Ada Okonkwo");
      expect(html).toContain("Classic Haircut");
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
