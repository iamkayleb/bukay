import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  const err = new Error("NEXT_NOT_FOUND");
  (err as { digest?: string }).digest = "NEXT_NOT_FOUND";
  throw err;
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

const findUnique = vi.fn();
const findManyServices = vi.fn();
const findManyHours = vi.fn();

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
    service: {
      findMany: (...args: unknown[]) => findManyServices(...args),
    },
    businessHour: {
      findMany: (...args: unknown[]) => findManyHours(...args),
    },
  },
}));

import PublicTenantPage, { generateMetadata } from "@/app/[slug]/page";
import { buildOpenGraphMeta, buildSeoMeta } from "@/app/[slug]/head";
import { getPublicTenantBySlug, isPublicTenantInactive } from "@/app/[slug]/tenant";

const demoTenantRow = {
  id: "tenant-1",
  name: "Bukay Demo Salon",
  slug: "demo",
  timezone: "Africa/Lagos",
  currency: "NGN",
};

const demoServices = [
  {
    id: "svc-1",
    name: "Classic Haircut",
    description: "Traditional cut and style.",
    durationMinutes: 30,
    priceCents: 5000,
    currency: "NGN",
  },
];

const demoHours = [
  {
    id: "bh-1",
    dayOfWeek: 1,
    opensAt: "09:00",
    closesAt: "18:00",
    isClosed: false,
  },
];

beforeEach(() => {
  notFound.mockClear();
  findUnique.mockReset();
  findManyServices.mockReset();
  findManyHours.mockReset();
});

describe("public tenant slug page", () => {
  it("loads an active tenant with services and hours for SSR", async () => {
    findUnique.mockResolvedValue(demoTenantRow);
    findManyServices.mockResolvedValue(demoServices);
    findManyHours.mockResolvedValue(demoHours);

    const tenant = await getPublicTenantBySlug("Demo");
    expect(tenant).toMatchObject({
      id: "tenant-1",
      slug: "demo",
      name: "Bukay Demo Salon",
    });
    expect(tenant?.services).toHaveLength(1);
    expect(tenant?.businessHours).toHaveLength(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: expect.any(Object),
    });
  });

  it("returns null for a missing tenant slug", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getPublicTenantBySlug("missing")).resolves.toBeNull();
  });

  it("treats explicit active=false as inactive", () => {
    expect(isPublicTenantInactive({ active: false })).toBe(true);
    expect(isPublicTenantInactive({ active: true })).toBe(false);
    expect(isPublicTenantInactive({})).toBe(false);
  });

  it("calls notFound for a missing slug", async () => {
    findUnique.mockResolvedValue(null);
    await expect(PublicTenantPage({ params: { slug: "unknown" } })).rejects.toThrow(
      /NEXT_NOT_FOUND/
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound for blank slug params", async () => {
    await expect(PublicTenantPage({ params: { slug: "  " } })).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(notFound).toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("renders branded shopfront content for a valid slug", async () => {
    findUnique.mockResolvedValue(demoTenantRow);
    findManyServices.mockResolvedValue(demoServices);
    findManyHours.mockResolvedValue(demoHours);

    const element = await PublicTenantPage({ params: { slug: "demo" } });
    expect(element).toBeTruthy();
    const json = JSON.stringify(element);
    expect(json).toContain("Bukay Demo Salon");
    expect(json).toContain("Classic Haircut");
    expect(json).toContain("Book now");
    expect(json).toContain("Monday");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("generateMetadata includes SEO and Open Graph fields", async () => {
    findUnique.mockResolvedValue(demoTenantRow);
    findManyServices.mockResolvedValue(demoServices);
    findManyHours.mockResolvedValue(demoHours);

    const meta = await generateMetadata({ params: { slug: "demo" } });
    expect(meta.title).toMatch(/Bukay Demo Salon/);
    expect(meta.description).toMatch(/Classic Haircut/);
    expect(meta.openGraph).toMatchObject({ url: expect.stringMatching(/\/demo$/) });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("slug head metadata helpers", () => {
  it("builds SEO meta tags", () => {
    const seo = buildSeoMeta({
      ...demoTenantRow,
      services: demoServices,
      businessHours: demoHours,
    });
    expect(seo.title).toBe("Bukay Demo Salon | Book online");
    expect(seo.description).toContain("Book with Bukay Demo Salon");
    expect(seo.robots).toEqual({ index: true, follow: true });
    expect(seo.alternates?.canonical).toMatch(/\/demo$/);
  });

  it("builds Open Graph tags", () => {
    const og = buildOpenGraphMeta({
      name: demoTenantRow.name,
      slug: demoTenantRow.slug,
      services: demoServices,
    });
    expect(og).toMatchObject({
      type: "website",
      title: expect.stringContaining("Bukay Demo Salon"),
      images: [expect.objectContaining({ width: 1200, height: 630 })],
      twitter: { card: "summary_large_image" },
    });
  });
});
