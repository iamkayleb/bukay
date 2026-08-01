import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TenantSettingsRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  brandColor: string;
  cancellationPolicy: string;
  updatedAt: Date;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  tenants: [] as TenantSettingsRow[],
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.findUnique,
      update: state.update,
    },
  },
}));

import { GET, PATCH } from "@/app/api/settings/route";

function tenant(overrides: Partial<TenantSettingsRow> = {}): TenantSettingsRow {
  return {
    id: "tenant-1",
    name: "Bukay Demo Salon",
    slug: "demo",
    timezone: "Africa/Lagos",
    currency: "NGN",
    logoUrl: null,
    brandColor: "#10b981",
    cancellationPolicy: "",
    updatedAt: new Date("2026-07-31T10:00:00.000Z"),
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
  state.tenants = [tenant(), tenant({ id: "tenant-2", name: "Booked Spa", slug: "booked-spa" })];

  state.findUnique.mockReset();
  state.update.mockReset();

  state.findUnique.mockImplementation(
    async (args: { where: { id?: string; slug?: string } }) =>
      state.tenants.find(
        (row) => row.id === args.where.id || (args.where.slug && row.slug === args.where.slug)
      ) ?? null
  );
  state.update.mockImplementation(
    async (args: { where: { id: string }; data: Partial<TenantSettingsRow> }) => {
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
        updatedAt: new Date("2026-07-31T11:00:00.000Z"),
      });
      state.tenants[index] = row;
      return row;
    }
  );
});

describe("/api/settings", () => {
  it("returns settings for the request tenant", async () => {
    const res = await GET(request("/api/settings"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({
      id: "tenant-1",
      name: "Bukay Demo Salon",
      slug: "demo",
      timezone: "Africa/Lagos",
      currency: "NGN",
      brandColor: "#10b981",
      cancellationPolicy: "",
    });
    expect(state.findUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: expect.objectContaining({ slug: true, cancellationPolicy: true }),
    });
  });

  it("updates settings for the request tenant", async () => {
    const res = await PATCH(
      jsonRequest("/api/settings", {
        name: "Kay Salon",
        slug: "kay-salon",
        timezone: "Africa/Lagos",
        currency: "NGN",
        logoUrl: "",
        brandColor: "#14b8a6",
        cancellationPolicy: "Cancel at least 24 hours before the appointment.",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings).toMatchObject({
      name: "Kay Salon",
      slug: "kay-salon",
      logoUrl: null,
      brandColor: "#14b8a6",
      cancellationPolicy: "Cancel at least 24 hours before the appointment.",
    });
    expect(state.update).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: {
        name: "Kay Salon",
        slug: "kay-salon",
        timezone: "Africa/Lagos",
        currency: "NGN",
        logoUrl: null,
        brandColor: "#14b8a6",
        cancellationPolicy: "Cancel at least 24 hours before the appointment.",
      },
      select: expect.objectContaining({ name: true, slug: true }),
    });
  });

  it("returns validation errors for invalid settings", async () => {
    const res = await PATCH(
      jsonRequest("/api/settings", {
        name: "",
        slug: "Admin",
        timezone: "",
        currency: "naira",
        logoUrl: "",
        brandColor: "green",
        cancellationPolicy: "",
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.name).toContain("Business name is required");
    expect(body.fieldErrors.slug).toContain("This slug is reserved");
    expect(body.fieldErrors.currency).toContain("Currency must be a 3-letter ISO code");
    expect(body.fieldErrors.brandColor).toContain("Brand color must be a 6-digit hex value");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate slugs with a helpful conflict", async () => {
    const res = await PATCH(
      jsonRequest("/api/settings", {
        name: "Booked Spa",
        slug: "booked-spa",
        timezone: "Africa/Lagos",
        currency: "NGN",
        logoUrl: "",
        brandColor: "#10b981",
        cancellationPolicy: "",
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("slug_unavailable");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("reports an unused slug as available", async () => {
    const res = await GET(request("/api/settings?slug=kay-salon"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      slug: "kay-salon",
      available: true,
    });
    expect(state.findUnique).toHaveBeenCalledWith({
      where: { slug: "kay-salon" },
      select: { id: true, slug: true },
    });
  });

  it("reports another tenant slug as unavailable", async () => {
    const res = await GET(request("/api/settings?slug=booked-spa"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      slug: "booked-spa",
      available: false,
    });
  });

  it("allows the current tenant to keep its slug", async () => {
    const res = await GET(request("/api/settings?slug=demo"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      slug: "demo",
      available: true,
    });
  });

  it("rejects reserved slugs before checking availability", async () => {
    const res = await GET(request("/api/settings?slug=admin"));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.slug).toContain("This slug is reserved");
  });

  it("resolves a tenant slug before reading settings", async () => {
    const res = await GET(
      new NextRequest("http://demo.example.com/api/settings", {
        headers: { host: "demo.example.com" },
      })
    );

    expect(res.status).toBe(200);
    expect(state.findUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: { id: true },
    });
    expect(state.findUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: expect.objectContaining({ slug: true }),
    });
  });
});
