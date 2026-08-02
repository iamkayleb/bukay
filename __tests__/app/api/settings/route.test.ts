import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  brandColor: string;
  logoUrl: string | null;
  cancellationPolicy: string | null;
  updatedAt: Date;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  tenants: [] as TenantRow[],
  tenantFindUnique: vi.fn(),
  tenantUpdate: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.tenantFindUnique,
      update: state.tenantUpdate,
    },
  },
}));

import { GET, PATCH } from "@/app/api/settings/route";

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "tenant-1",
    name: "Bukay Demo Salon",
    slug: "demo",
    timezone: "Africa/Lagos",
    currency: "NGN",
    brandColor: "#047857",
    logoUrl: "https://example.com/logo.png",
    cancellationPolicy: "Cancel with 24 hours notice.",
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    ...overrides,
  };
}

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    headers: {
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(path: string, body: unknown, init: NextRequestInit = {}) {
  return request(path, {
    ...init,
    method: init.method ?? "PATCH",
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.tenants = [tenant(), tenant({ id: "tenant-2", slug: "other" })];
  state.tenantFindUnique.mockReset();
  state.tenantUpdate.mockReset();

  state.tenantFindUnique.mockImplementation(
    async (args: { where: { id?: string; slug?: string } }) =>
      state.tenants.find(
        (row) =>
          (args.where.id && row.id === args.where.id) ||
          (args.where.slug && row.slug === args.where.slug)
      ) ?? null
  );
  state.tenantUpdate.mockImplementation(
    async (args: { where: { id: string }; data: Partial<TenantRow> }) => {
      const index = state.tenants.findIndex((row) => row.id === args.where.id);
      if (index === -1) {
        throw Object.assign(new Error("Record not found"), { code: "P2025" });
      }

      if (
        args.data.slug &&
        state.tenants.some((row) => row.id !== args.where.id && row.slug === args.data.slug)
      ) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }

      const row = tenant({
        ...state.tenants[index],
        ...args.data,
        updatedAt: new Date("2026-06-02T10:00:00.000Z"),
      });
      state.tenants[index] = row;
      return row;
    }
  );
});

describe("/api/settings", () => {
  it("loads persisted tenant settings for the request tenant", async () => {
    const res = await GET(request("/api/settings"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({
      id: "tenant-1",
      name: "Bukay Demo Salon",
      slug: "demo",
      brandColor: "#047857",
      logoUrl: "https://example.com/logo.png",
      cancellationPolicy: "Cancel with 24 hours notice.",
      publicUrl: "https://demo.bukay.app",
    });
    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: expect.objectContaining({
        brandColor: true,
        logoUrl: true,
        cancellationPolicy: true,
      }),
    });
  });

  it("saves brand settings through the tenant settings API", async () => {
    const res = await PATCH(
      jsonRequest("/api/settings", {
        name: "Fresh Cuts",
        slug: "fresh-cuts",
        brandColor: "#2563eb",
        logoUrl: "",
        cancellationPolicy: "Please cancel 12 hours ahead.",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({
      name: "Fresh Cuts",
      slug: "fresh-cuts",
      brandColor: "#2563eb",
      logoUrl: null,
      cancellationPolicy: "Please cancel 12 hours ahead.",
      publicUrl: "https://fresh-cuts.bukay.app",
    });
    expect(state.tenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: {
        name: "Fresh Cuts",
        slug: "fresh-cuts",
        brandColor: "#2563eb",
        logoUrl: null,
        cancellationPolicy: "Please cancel 12 hours ahead.",
      },
      select: expect.any(Object),
    });
  });

  it("rejects invalid brand colors before persisting", async () => {
    const res = await PATCH(
      jsonRequest("/api/settings", {
        brandColor: "blue",
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.brandColor).toContain("Brand color must be a 6-digit hex color");
    expect(state.tenantUpdate).not.toHaveBeenCalled();
  });

  it("rejects brand colors without enough contrast before persisting", async () => {
    const res = await PATCH(
      jsonRequest("/api/settings", {
        brandColor: "#10b981",
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.brandColor).toContain(
      "Brand color must have at least 4.5:1 contrast with white text"
    );
    expect(state.tenantUpdate).not.toHaveBeenCalled();
  });

  it("reports slug conflicts when another tenant already owns the slug", async () => {
    const res = await PATCH(
      jsonRequest("/api/settings", {
        slug: "other",
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("tenant_slug_conflict");
  });
});
