import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Service = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  active: boolean;
};

const state = vi.hoisted(() => ({
  services: [] as Service[],
  findMany: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: () => ({ get: () => null }) }));

vi.mock("@/app/lib/resolve-tenant", () => ({
  resolveTenant: () => ({ tenantId: "tenant-1", source: "header" }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    service: { findMany: state.findMany },
  },
}));

import { ServicesList } from "@/app/(app)/services/services-list";

beforeEach(() => {
  state.services = [];
  state.findMany.mockReset();
  state.findMany.mockImplementation(async (args: { where: { tenantId: string } }) =>
    state.services.filter((service) => service.tenantId === args.where.tenantId)
  );
});

describe("ServicesList", () => {
  it("renders every service for the current tenant and excludes another tenant", async () => {
    state.services = [
      {
        id: "service-1",
        tenantId: "tenant-1",
        name: "Haircut",
        durationMinutes: 45,
        priceCents: 750000,
        currency: "NGN",
        active: true,
      },
      {
        id: "service-2",
        tenantId: "tenant-1",
        name: "Braids",
        durationMinutes: 90,
        priceCents: 1200000,
        currency: "NGN",
        active: false,
      },
      {
        id: "service-3",
        tenantId: "tenant-2",
        name: "Other tenant service",
        durationMinutes: 60,
        priceCents: 500000,
        currency: "NGN",
        active: true,
      },
    ];

    const html = renderToStaticMarkup(await ServicesList());

    expect(html).toContain("Haircut");
    expect(html).toContain("Braids");
    expect(html).not.toContain("Other tenant service");
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-1" } })
    );
  });

  it("renders an empty state when the tenant has no services", async () => {
    const html = renderToStaticMarkup(await ServicesList());

    expect(html).toContain("No services yet.");
  });
});
