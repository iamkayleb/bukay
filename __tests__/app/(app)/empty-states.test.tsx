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