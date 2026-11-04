import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  active: boolean;
};

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  services: [] as ServiceRow[],
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

import ServicesPage from "@/app/(app)/services/page";
import { submitCreateServiceForm } from "@/app/(app)/services/service-form";
import { ServicesList } from "@/app/(app)/services/services-list";

function service(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: "svc-1",
    tenantId: "tenant-1",
    name: "Classic Haircut",
    description: "Traditional cut and style.",
    durationMinutes: 30,
    priceCents: 5000,
    currency: "NGN",
    active: true,
    ...overrides,
  };
}

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ServicesList", () => {
  it("covers a tenant with two services", async () => {
    signInAs("tenant-1");
    state.services = [
      service({
        id: "svc-2",
        name: "Beard Trim",
        durationMinutes: 20,
        priceCents: 3000,
        active: false,
      }),
      service(),
      service({ id: "svc-other", tenantId: "tenant-2", name: "Other Tenant Facial" }),
    ];

    const html = renderToStaticMarkup(await ServicesList());

    expect(html).toContain("Beard Trim");
    expect(html).toContain("Classic Haircut");
    expect(html).toContain("20 min");
    expect(html).toContain("30 min");
    expect(html).toContain("Inactive");
    expect(html).toContain("Active");
    expect(html.indexOf("Beard Trim")).toBeLessThan(html.indexOf("Classic Haircut"));
    expect(html).not.toContain("Other Tenant Facial");
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-1" } })
    );
  });

  it("covers a tenant with none", async () => {
    signInAs("tenant-empty");
    state.services = [
      service(),
      service({ id: "svc-other", tenantId: "tenant-2", name: "Other Tenant Facial" }),
    ];

    const html = renderToStaticMarkup(await ServicesList());

    expect(html).toContain("No services yet.");
    expect(html).not.toContain("Classic Haircut");
    expect(html).not.toContain("Other Tenant Facial");
  });

  it("never renders a service belonging to another tenant", async () => {
    signInAs("tenant-1");
    state.services = [
      service({ name: "Classic Haircut" }),
      service({ id: "svc-other", tenantId: "tenant-2", name: "Other Tenant Facial" }),
    ];

    const html = renderToStaticMarkup(await ServicesList());

    expect(html).toContain("Classic Haircut");
    expect(html).not.toContain("Other Tenant Facial");
    expect(state.services.filter((row) => row.tenantId === "tenant-2")).toHaveLength(1);
  });
});

describe("Services page", () => {
  it("lists every service belonging to the signed-in tenant above the create form", async () => {
    signInAs("tenant-1");
    state.services = [
      service({ id: "svc-2", name: "Beard Trim" }),
      service(),
      service({ id: "svc-other", tenantId: "tenant-2", name: "Other Tenant Facial" }),
    ];

    const html = renderToStaticMarkup(await ServicesPage());

    expect(html).toContain("Classic Haircut");
    expect(html).toContain("Beard Trim");
    expect(html).not.toContain("Other Tenant Facial");
    expect(html.indexOf("Classic Haircut")).toBeLessThan(html.indexOf("Create service"));
    expect(html.indexOf("Beard Trim")).toBeLessThan(html.indexOf("Create service"));
  });
});

describe("create service form", () => {
  it("submitting the create form adds a service and it appears in the list", async () => {
    signInAs("tenant-1");
    state.services = [
      service(),
      service({ id: "svc-other", tenantId: "tenant-2", name: "Other Tenant Facial" }),
    ];

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        name: string;
        durationMinutes: number;
        priceKobo: number;
        bufferMinutes: number;
        active: boolean;
      };
      state.services.push(
        service({
          id: "svc-new",
          tenantId: "tenant-1",
          name: body.name,
          description: null,
          durationMinutes: body.durationMinutes,
          priceCents: body.priceKobo,
          active: body.active,
        })
      );
      return new Response(
        JSON.stringify({ ok: true, service: { id: "svc-new", name: body.name } }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitCreateServiceForm({
      name: "Beard Trim",
      durationMinutes: "20",
      priceNaira: "30",
      bufferMinutes: "5",
      active: true,
    });

    expect(result).toEqual({ ok: true, service: { id: "svc-new", name: "Beard Trim" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/services",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Beard Trim",
          durationMinutes: 20,
          priceKobo: 3000,
          bufferMinutes: 5,
          active: true,
        }),
      })
    );

    const html = renderToStaticMarkup(await ServicesList());
    expect(html).toContain("Classic Haircut");
    expect(html).toContain("Beard Trim");
    expect(html).not.toContain("Other Tenant Facial");
  });

  it("does not post when the form is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitCreateServiceForm({
      name: " ",
      durationMinutes: "0",
      priceNaira: "-1",
      bufferMinutes: "-1",
      active: true,
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
