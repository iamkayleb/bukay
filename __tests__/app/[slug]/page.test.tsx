import { describe, expect, it, vi, beforeEach } from "vitest";

const { findFirst, notFound } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findFirst,
    },
  },
}));

vi.mock("next/navigation", () => ({
  notFound,
}));

import TenantLandingPage from "@/app/[slug]/page";

describe("/{slug} tenant landing page", () => {
  beforeEach(() => {
    findFirst.mockReset();
    notFound.mockClear();
  });

  it("renders an active tenant landing page", async () => {
    findFirst.mockResolvedValue({
      id: "tenant-1",
      name: "Bukay Demo Salon",
      currency: "NGN",
      services: [
        {
          id: "service-1",
          name: "Classic Haircut",
          description: "Traditional cut and style.",
          durationMinutes: 30,
          priceCents: 5000,
        },
      ],
      businessHours: [
        {
          id: "hours-1",
          dayOfWeek: 1,
          opensAt: "09:00",
          closesAt: "18:00",
          isClosed: false,
        },
      ],
    });

    const page = await TenantLandingPage({ params: { slug: "demo" } });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "demo",
          active: true,
        },
      })
    );
    expect(notFound).not.toHaveBeenCalled();
    expect(JSON.stringify(page)).toContain("Bukay Demo Salon");
    expect(JSON.stringify(page)).toContain("Classic Haircut");
    expect(JSON.stringify(page)).toContain("Book now");
  });

  it("returns not found when the tenant is missing or inactive", async () => {
    findFirst.mockResolvedValue(null);

    await expect(TenantLandingPage({ params: { slug: "inactive-shop" } })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "inactive-shop",
          active: true,
        },
      })
    );
    expect(notFound).toHaveBeenCalledOnce();
  });
});
