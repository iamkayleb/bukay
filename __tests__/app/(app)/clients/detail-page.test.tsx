import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type ClientProfileRow = {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string;
  notes: string | null;
  createdAt: Date;
  tenant: {
    currency: string;
  };
  bookings: Array<{
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    notes: string | null;
    service: {
      name: string;
      priceCents: number;
      currency: string;
    };
    staff: {
      name: string;
    } | null;
    payments: Array<{
      amountCents: number;
      currency: string;
      status: string;
    }>;
  }>;
};

const state = vi.hoisted(() => ({
  clientFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  headerMap: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => state.headerMap.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    client: {
      findFirst: state.clientFindFirst,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

import ClientProfilePage from "@/app/(app)/clients/[id]/page";

function profile(overrides: Partial<ClientProfileRow> = {}): ClientProfileRow {
  return {
    id: "client-1",
    tenantId: "tenant-1",
    name: "Ada Okafor",
    email: "ada@example.com",
    phone: "+2348012345678",
    notes: "Prefers morning appointments.",
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    tenant: { currency: "NGN" },
    bookings: [
      {
        id: "booking-1",
        startsAt: new Date("2026-06-15T10:00:00.000Z"),
        endsAt: new Date("2026-06-15T10:30:00.000Z"),
        status: "confirmed",
        notes: "Classic cut.",
        service: { name: "Classic Haircut", priceCents: 5_000, currency: "NGN" },
        staff: { name: "Demo Owner" },
        payments: [
          { amountCents: 5_000, currency: "NGN", status: "paid" },
          { amountCents: 2_000, currency: "NGN", status: "pending" },
        ],
      },
      {
        id: "booking-2",
        startsAt: new Date("2026-06-10T10:00:00.000Z"),
        endsAt: new Date("2026-06-10T10:30:00.000Z"),
        status: "no-show",
        notes: null,
        service: { name: "Beard Trim", priceCents: 3_000, currency: "NGN" },
        staff: null,
        payments: [{ amountCents: 3_000, currency: "NGN", status: "paid" }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.headerMap = new Map([["x-tenant-id", "tenant-1"]]);
  state.clientFindFirst.mockReset();
  state.tenantFindUnique.mockReset();
  state.clientFindFirst.mockResolvedValue(profile());
  state.tenantFindUnique.mockResolvedValue({ id: "tenant-from-slug" });
});

describe("/clients/[id] page", () => {
  it("loads a tenant-scoped client profile with booking payments", async () => {
    await ClientProfilePage({ params: { id: "client-1" } });

    expect(state.clientFindFirst).toHaveBeenCalledWith({
      where: { id: "client-1", tenantId: "tenant-1" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notes: true,
        createdAt: true,
        tenant: { select: { currency: true } },
        bookings: {
          orderBy: { startsAt: "desc" },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            notes: true,
            service: { select: { name: true, priceCents: true, currency: true } },
            staff: { select: { name: true } },
            payments: {
              select: { amountCents: true, currency: true, status: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
  });

  it("renders lifetime value from paid payments on confirmed bookings", async () => {
    const element = await ClientProfilePage({ params: { id: "client-1" } });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Ada Okafor");
    expect(html).toContain("50.00");
    expect(html).toContain("No-shows");
    expect(html).toContain(">1</dd>");
    expect(html).toContain("Classic Haircut");
    expect(html).toContain("Beard Trim");
    expect(html).toContain("Prefers morning appointments.");
  });

  it("resolves a tenant slug when no tenant id header is present", async () => {
    state.headerMap = new Map([["host", "demo.example.com"]]);

    await ClientProfilePage({ params: { id: "client-1" } });

    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: { id: true },
    });
    expect(state.clientFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client-1", tenantId: "tenant-from-slug" } })
    );
  });
});
