import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  brandColor: string;
  logoUrl: string | null;
  cancellationPolicy: string | null;
};

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
};

const state = vi.hoisted(() => ({
  host: "demo.bukay.app",
  tenantIdHeader: null as string | null,
  tenants: [] as TenantRow[],
  services: [] as ServiceRow[],
  tenantFindUnique: vi.fn(),
  serviceFindMany: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => {
      if (name.toLowerCase() === "x-tenant-id") return state.tenantIdHeader;
      if (name.toLowerCase() === "host") return state.host;
      if (name.toLowerCase() === "x-bukay-public-tenant-slug") {
        const subdomain = state.host.split(".")[0] ?? null;
        return subdomain && !["www", "app", "api", "admin"].includes(subdomain) ? subdomain : null;
      }
      return null;
    },
  }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.tenantFindUnique,
    },
    service: {
      findMany: state.serviceFindMany,
    },
  },
}));

import Home from "@/app/page";

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "tenant-1",
    name: "Fresh Cuts",
    slug: "demo",
    currency: "NGN",
    brandColor: "#2563eb",
    logoUrl: "https://example.com/fresh-cuts-logo.png",
    cancellationPolicy: "Cancel at least 12 hours before your appointment.",
    ...overrides,
  };
}

function service(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: "service-1",
    tenantId: "tenant-1",
    name: "Classic Haircut",
    description: "Wash, cut, and style.",
    durationMinutes: 45,
    priceCents: 750000,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.host = "demo.bukay.app";
  state.tenantIdHeader = null;
  state.tenants = [tenant()];
  state.services = [
    service(),
    service({
      id: "service-2",
      name: "Hidden Service",
      active: false,
    }),
    service({
      id: "service-3",
      tenantId: "tenant-2",
      name: "Other Tenant Service",
    }),
  ];

  state.tenantFindUnique.mockReset();
  state.serviceFindMany.mockReset();
  state.tenantFindUnique.mockImplementation(
    async (args: { where: { id?: string; slug?: string } }) =>
      state.tenants.find(
        (row) =>
          (args.where.id && row.id === args.where.id) ||
          (args.where.slug && row.slug === args.where.slug)
      ) ?? null
  );
  state.serviceFindMany.mockImplementation(
    async (args: { where: { tenantId: string; active?: boolean } }) =>
      state.services.filter(
        (row) =>
          row.tenantId === args.where.tenantId &&
          (args.where.active === undefined || row.active === args.where.active)
      )
  );
});

describe("Home page", () => {
  it("exports a React component", async () => {
    expect(typeof Home).toBe("function");
  });

  it("renders saved tenant branding on the public booking page", async () => {
    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Fresh Cuts");
    expect(html).toContain("https://example.com/fresh-cuts-logo.png");
    expect(html).toContain("--brand-color:#2563eb");
    expect(html).toContain("Cancel at least 12 hours before your appointment.");
    expect(html).toContain("Classic Haircut");
    expect(html).toContain("7,500");
    expect(html).not.toContain("Hidden Service");
    expect(html).not.toContain("Other Tenant Service");
    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: expect.objectContaining({
        brandColor: true,
        logoUrl: true,
        cancellationPolicy: true,
      }),
    });
    expect(state.serviceFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", active: true },
      orderBy: { name: "asc" },
      select: expect.objectContaining({
        priceCents: true,
      }),
    });
  });

  it("uses the request tenant id header before subdomain lookup", async () => {
    state.tenantIdHeader = "tenant-1";

    renderToStaticMarkup(await Home());

    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: expect.any(Object),
    });
  });

  it("resolves a changed public slug to that tenant's booking page", async () => {
    state.host = "fresh-cuts.bukay.app";
    state.tenants = [
      tenant({
        id: "tenant-renamed",
        name: "Fresh Cuts Renamed",
        slug: "fresh-cuts",
        logoUrl: null,
      }),
      tenant({ id: "tenant-old", name: "Old Demo", slug: "demo" }),
    ];
    state.services = [
      service({
        tenantId: "tenant-renamed",
        name: "Slug Routed Trim",
      }),
      service({
        tenantId: "tenant-old",
        name: "Old Demo Cut",
      }),
    ];

    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Fresh Cuts Renamed");
    expect(html).toContain("Slug Routed Trim");
    expect(html).not.toContain("Old Demo");
    expect(html).not.toContain("Old Demo Cut");
    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "fresh-cuts" },
      select: expect.any(Object),
    });
    expect(state.serviceFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-renamed", active: true },
      orderBy: { name: "asc" },
      select: expect.any(Object),
    });
  });

  it("renders an unavailable state when no tenant resolves", async () => {
    state.host = "www.bukay.app";

    const html = renderToStaticMarkup(await Home());

    expect(html).toContain("Booking page unavailable");
    expect(state.serviceFindMany).not.toHaveBeenCalled();
  });
});
