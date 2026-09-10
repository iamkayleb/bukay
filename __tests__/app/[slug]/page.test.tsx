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
  prisma: {
    tenant: {
      findUnique: state.findUnique,
    },
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    const err = new Error("__NOT_FOUND__");
    (err as { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  },
}));

import ShopfrontPage, { generateMetadata } from "@/app/[slug]/page";

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
        description: "Traditional cut and style.",
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

describe("ShopfrontPage", () => {
  it("renders the tenant name and active services for a known slug", async () => {
    state.findUnique.mockResolvedValue(tenant());

    const result = (await ShopfrontPage({
      params: { slug: "demo" },
    })) as unknown as { props: { children: unknown } };

    expect(state.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "demo" } })
    );

    const json = JSON.stringify(result);
    expect(json).toContain("Bukay Demo Salon");
    expect(json).toContain("Classic Haircut");
  });

  it("calls notFound() when the slug does not match a tenant", async () => {
    state.findUnique.mockResolvedValue(null);

    await expect(ShopfrontPage({ params: { slug: "missing" } })).rejects.toThrow("__NOT_FOUND__");
  });

  it("calls notFound() when the tenant is inactive", async () => {
    state.findUnique.mockResolvedValue(tenant({ active: false }));

    await expect(ShopfrontPage({ params: { slug: "demo" } })).rejects.toThrow("__NOT_FOUND__");
  });

  it("renders an empty state when the tenant has no active services", async () => {
    state.findUnique.mockResolvedValue(tenant({ services: [] }));

    const result = await ShopfrontPage({ params: { slug: "demo" } });

    expect(JSON.stringify(result)).toContain("No services are available for booking yet.");
  });
});

describe("generateMetadata", () => {
  it("includes SEO and Open Graph tags for a known tenant", async () => {
    state.findUnique.mockResolvedValue(tenant());

    const metadata = await generateMetadata({ params: { slug: "demo" } });

    expect(metadata.title).toBe("Bukay Demo Salon | Book with Bukay");
    expect(metadata.description).toContain("Bukay Demo Salon");
    expect(metadata.alternates?.canonical).toBe("/demo");
    expect(metadata.openGraph).toMatchObject({
      title: "Bukay Demo Salon | Book with Bukay",
      type: "website",
      siteName: "Bukay",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });

  it("builds an absolute canonical URL when ROOT_HOST is set", async () => {
    const previous = process.env.ROOT_HOST;
    process.env.ROOT_HOST = "bukay.app";
    state.findUnique.mockResolvedValue(tenant());

    const metadata = await generateMetadata({ params: { slug: "demo" } });

    expect(metadata.alternates?.canonical).toBe("https://bukay.app/demo");

    process.env.ROOT_HOST = previous;
  });

  it("falls back to a generic title when the tenant is missing", async () => {
    state.findUnique.mockResolvedValue(null);

    const metadata = await generateMetadata({ params: { slug: "missing" } });

    expect(metadata.title).toBe("Shop not found");
  });
});
