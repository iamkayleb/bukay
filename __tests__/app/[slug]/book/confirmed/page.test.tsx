import { beforeEach, describe, expect, it, vi } from "vitest";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  active: boolean;
  services: [];
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

import ConfirmedBookingPage from "@/app/[slug]/book/confirmed/page";

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "tenant-1",
    name: "Bukay Demo Salon",
    slug: "demo",
    currency: "NGN",
    active: true,
    services: [],
    ...overrides,
  };
}

beforeEach(() => {
  state.findUnique.mockReset();
});

describe("ConfirmedBookingPage", () => {
  it("renders a confirmation and a link back to the shop", async () => {
    state.findUnique.mockResolvedValue(tenant());

    const page = await ConfirmedBookingPage({ params: { slug: "demo" } });
    const json = JSON.stringify(page);

    expect(state.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demo" } })
    );
    expect(json).toContain("Your booking is confirmed");
    expect(json).toContain("Bukay Demo Salon");
    expect(json).toContain("Back to ");
    expect(json).toContain("/demo");
  });

  it("returns a not-found response for an unknown shop", async () => {
    state.findUnique.mockResolvedValue(null);

    await expect(ConfirmedBookingPage({ params: { slug: "missing" } })).rejects.toThrow(
      "__NOT_FOUND__"
    );
  });
});
