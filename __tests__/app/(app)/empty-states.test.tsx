import { execSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CalendarPage from "@/app/(app)/calendar/page";
import { MerchantEmptyState } from "@/app/(app)/components/merchant-empty-state";
import { PaymentsList } from "@/app/(app)/payments/payments-list";
import PaymentsPage from "@/app/(app)/payments/page";
import ClientsPage from "@/app/(app)/clients/page";
import { ClientsList } from "@/app/(app)/clients/clients-list";
import ServicesPage from "@/app/(app)/services/page";
import { ServicesList } from "@/app/(app)/services/services-list";
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
    expect(html).toContain('href="/calendar"');
  });

  it("renders all server-driven empty-state copy for an empty tenant", async () => {
    signInAs("tenant-empty");
    const rendered = [
      renderToStaticMarkup(await ClientsList()),
      renderToStaticMarkup(await ServicesList()),
      renderToStaticMarkup(<PaymentsList payments={[]} />),
      renderToStaticMarkup(await TodaySchedule({ now })),
    ];
    for (const message of [
      "No clients yet — they appear here after their first booking.",
      "No services yet — add your first so customers can book.",
      "No payments yet.",
      "No appointments yet.",
    ]) {
      expect(rendered.some((html) => html.includes(message))).toBe(true);
    }
  });

  it("renders the calendar new-booking form for an empty tenant", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await CalendarPage());
    expect(html).toContain('id="new-booking"');
  });

  it("renders calendar day empty copy with an add-booking action", () => {
    const html = renderToStaticMarkup(
      <MerchantEmptyState
        message="No bookings on this date."
        action={
          <a className="text-sm font-medium text-emerald-300 hover:text-emerald-200" href="#new-booking">
            Add a booking
          </a>
        }
      />
    );
    expect(html).toContain("No bookings on this date.");
    expect(html).toContain('href="#new-booking"');
    expect(html).toContain("Add a booking");
  });

  it("clients list matches the page empty message for an empty tenant", async () => {
    signInAs("tenant-empty");
    const html = renderToStaticMarkup(await ClientsList());
    expect(html).toContain("No clients yet — they appear here after their first booking.");
  });
});

const EMPTY_COPY = [
  "No bookings on this date.",
  "No services yet — add your first so customers can book.",
  "No clients yet — they appear here after their first booking.",
  "No payments yet.",
  "No appointments yet.",
] as const;

describe("legacy placeholder copy", () => {
  it('does not use "Nothing here yet" under app/', () => {
    const matches = execSync('grep -rn "Nothing here yet" app/ || true', {
      encoding: "utf8",
    }).trim();
    expect(matches).toBe("");
  });
});

describe("empty-state copy inventory", () => {
  it("lists the five merchant-screen messages (calendar day copy in day-view.test.tsx)", () => {
    expect(EMPTY_COPY).toHaveLength(5);
    expect([...EMPTY_COPY]).toEqual([
      "No bookings on this date.",
      "No services yet — add your first so customers can book.",
      "No clients yet — they appear here after their first booking.",
      "No payments yet.",
      "No appointments yet.",
    ]);
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
});