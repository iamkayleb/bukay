import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ServicesPage from "@/app/(app)/services/page";
import { merchantEmptyMessages } from "@/app/(app)/merchant-empty-copy";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  services: [] as {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number;
    bufferMinutes: number;
    currency: string;
    active: boolean;
  }[],
  findMany: vi.fn(),
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
    service: {
      findMany: (...args: unknown[]) => state.findMany(...args),
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
  state.services = [];
  state.findMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.findMany.mockImplementation(async (args: { where?: { tenantId?: string } }) => {
    const tenantId = args?.where?.tenantId;
    if (!tenantId) {
      throw new Error("Service.findMany requires a top-level tenantId in where");
    }

    return state.services
      .filter((row) => row.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
});

describe("ServicesPage", () => {
  it("shows the empty-state message when the tenant has no services", async () => {
    signInAs("tenant-empty");

    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain(merchantEmptyMessages.services);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-label="Services"');
  });

  it("shows the create form below the empty-state message", async () => {
    signInAs("tenant-empty");

    const html = renderToStaticMarkup(await ServicesPage());

    const emptyIndex = html.indexOf(merchantEmptyMessages.services);
    const formIndex = html.indexOf('name="durationMinutes"');
    expect(emptyIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(emptyIndex);
  });

  it("lists services when the tenant has data", async () => {
    signInAs("tenant-demo");
    state.services = [
      {
        id: "svc-1",
        tenantId: "tenant-demo",
        name: "Classic Haircut",
        description: null,
        durationMinutes: 30,
        priceCents: 5000,
        bufferMinutes: 0,
        currency: "NGN",
        active: true,
      },
    ];

    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain("Classic Haircut");
    expect(html).not.toContain(merchantEmptyMessages.services);
  });
});