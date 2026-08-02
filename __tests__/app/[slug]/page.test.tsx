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

import TenantLandingPage, { generateMetadata } from "@/app/[slug]/page";

describe("/{slug} tenant landing page", () => {
  beforeEach(() => {
    findFirst.mockReset();
    notFound.mockClear();
    delete process.env.NEXT_PUBLIC_SITE_URL;
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

  it("generates tenant-specific SEO and Open Graph metadata", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://booking.example.test/path";
    findFirst.mockResolvedValue({
      name: "Bukay Demo Salon",
      services: [
        { name: "Beard Trim" },
        { name: "Classic Haircut" },
        { name: "Full Grooming Package" },
        { name: "Express Styling" },
      ],
    });

    const metadata = await generateMetadata({ params: { slug: "demo" } });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "demo",
          active: true,
        },
      })
    );
    expect(metadata.title).toBe("Bukay Demo Salon | Book appointments with Bukay");
    expect(metadata.description).toBe(
      "Book Beard Trim, Classic Haircut, Full Grooming Package and more with Bukay Demo Salon. View hours, services, and reserve your visit online with Bukay."
    );
    expect(metadata.alternates).toEqual({
      canonical: "https://booking.example.test/demo",
    });
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        title: metadata.title,
        description: metadata.description,
        url: "https://booking.example.test/demo",
        siteName: "Bukay",
        type: "website",
      })
    );
    expect(metadata.twitter).toEqual(
      expect.objectContaining({
        card: "summary",
        title: metadata.title,
        description: metadata.description,
      })
    );
    expect(metadata.robots).toEqual({
      index: true,
      follow: true,
    });
  });

  it("marks missing or inactive tenant metadata as noindex", async () => {
    findFirst.mockResolvedValue(null);

    const metadata = await generateMetadata({ params: { slug: "inactive-shop" } });

    expect(metadata.title).toBe("Business not found | Bukay");
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
