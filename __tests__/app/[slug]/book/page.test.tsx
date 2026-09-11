import { beforeEach, describe, expect, it, vi } from "vitest";

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  active: boolean;
  services: ServiceRow[];
};

const state = vi.hoisted(() => ({
  findUnique: vi.fn<[unknown], Promise<TenantRow | null>>(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: { tenant: { findUnique: state.findUnique } },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("__NOT_FOUND__");
  },
}));

import BookingPage from "@/app/[slug]/book/page";
import { BookingStepper } from "@/app/[slug]/book/booking-stepper";

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "tenant-1",
    name: "Bukay Demo Salon",
    slug: "demo",
    currency: "NGN",
    active: true,
    services: [
      {
        id: "service-1",
        name: "Classic Haircut",
        description: null,
        durationMinutes: 30,
        priceCents: 5000,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.findUnique.mockReset();
});

describe("BookingPage", () => {
  it("renders a booking stepper with the shop's active services", async () => {
    state.findUnique.mockResolvedValue(tenant());

    const page = await BookingPage({ params: { slug: "demo" } });
    const json = JSON.stringify(page);

    expect(state.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demo" } })
    );
    expect(json).toContain("Book an appointment");
    expect(json).toContain("Classic Haircut");
    expect(
      (page as unknown as { props: { children: Array<{ type: unknown }> } }).props.children[1].type
    ).toBe(BookingStepper);
  });

  it("returns a not-found response for an unknown shop", async () => {
    state.findUnique.mockResolvedValue(null);

    await expect(BookingPage({ params: { slug: "missing" } })).rejects.toThrow("__NOT_FOUND__");
  });
});
