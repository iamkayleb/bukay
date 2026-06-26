import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const state = vi.hoisted(() => ({
  services: [] as ServiceRow[],
  tenants: [{ id: "tenant-from-slug", slug: "demo" }],
  findMany: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: {
      findMany: state.findMany,
      create: state.create,
      findFirst: state.findFirst,
      update: state.update,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/services/[id]/route";
import { GET, POST } from "@/app/api/services/route";

function service(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: "service-1",
    tenantId: "tenant-1",
    name: "Haircut",
    durationMinutes: 45,
    priceKobo: 750000,
    bufferMinutes: 10,
    active: true,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    ...overrides,
  };
}

function request(path: string, init: RequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    headers: {
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(path: string, body: unknown, init: RequestInit = {}) {
  return request(path, {
    ...init,
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.services = [
    service(),
    service({ id: "service-2", tenantId: "tenant-2", name: "Massage" }),
  ];

  state.findMany.mockReset();
  state.create.mockReset();
  state.findFirst.mockReset();
  state.update.mockReset();
  state.tenantFindUnique.mockReset();

  state.findMany.mockImplementation(async (args: { where: { tenantId: string } }) =>
    state.services.filter((row) => row.tenantId === args.where.tenantId),
  );
  state.create.mockImplementation(async (args: { data: ServiceRow }) => {
    const row = service({
      id: `service-${state.services.length + 1}`,
      ...args.data,
    });
    state.services.push(row);
    return row;
  });
  state.findFirst.mockImplementation(async (args: { where: { tenantId: string; id: string } }) =>
    state.services.find(
      (row) => row.tenantId === args.where.tenantId && row.id === args.where.id,
    ) ?? null,
  );
  state.update.mockImplementation(
    async (args: { where: { tenantId: string; id: string }; data: Partial<ServiceRow> }) => {
      const index = state.services.findIndex(
        (row) => row.tenantId === args.where.tenantId && row.id === args.where.id,
      );
      if (index === -1) {
        throw Object.assign(new Error("Record not found"), { code: "P2025" });
      }

      const row = service({
        ...state.services[index],
        ...args.data,
        updatedAt: new Date("2026-06-02T10:00:00.000Z"),
      });
      state.services[index] = row;
      return row;
    },
  );
  state.tenantFindUnique.mockImplementation(
    async (args: { where: { slug: string }; select: { id: boolean } }) =>
      state.tenants.find((tenant) => tenant.slug === args.where.slug) ?? null,
  );
});

describe("/api/services", () => {
  it("lists services scoped to the request tenant", async () => {
    const res = await GET(request("/api/services"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services).toHaveLength(1);
    expect(body.services[0]).toMatchObject({
      id: "service-1",
      tenantId: "tenant-1",
      priceKobo: 750000,
    });
    expect(state.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  });

  it("creates a service with tenantId from the request and stores priceKobo", async () => {
    const res = await POST(
      jsonRequest("/api/services", {
        name: "Braids",
        durationMinutes: 120,
        priceKobo: 2500000,
        bufferMinutes: 15,
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.service).toMatchObject({
      tenantId: "tenant-1",
      name: "Braids",
      priceKobo: 2500000,
      bufferMinutes: 15,
      active: true,
    });
    expect(state.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        name: "Braids",
        durationMinutes: 120,
        priceKobo: 2500000,
        bufferMinutes: 15,
        active: true,
      },
    });
  });

  it("returns inline validation errors for invalid create payloads", async () => {
    const res = await POST(
      jsonRequest("/api/services", {
        name: "",
        durationMinutes: 0,
        priceKobo: -1,
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.name).toContain("Name is required");
    expect(body.fieldErrors.priceKobo).toContain("Price cannot be negative");
    expect(state.create).not.toHaveBeenCalled();
  });

  it("returns one service only when id and tenant both match", async () => {
    const res = await GET_ONE(request("/api/services/service-1"), {
      params: { id: "service-1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service.id).toBe("service-1");
    expect(state.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "service-1" },
    });
  });

  it("updates only a tenant-scoped service", async () => {
    const res = await PATCH(
      jsonRequest(
        "/api/services/service-1",
        {
          priceKobo: "900000",
          active: false,
        },
        { method: "PATCH" },
      ),
      { params: { id: "service-1" } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toMatchObject({ priceKobo: 900000, active: false });
    expect(state.update).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "service-1" },
      data: { priceKobo: 900000, active: false },
    });
  });

  it("soft-deletes a service by setting active false", async () => {
    const res = await DELETE(request("/api/services/service-1", { method: "DELETE" }), {
      params: { id: "service-1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service.active).toBe(false);
    expect(state.update).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "service-1" },
      data: { active: false },
    });
  });

  it("resolves a tenant slug before running scoped service queries", async () => {
    const res = await GET(
      new NextRequest("http://demo.example.com/api/services", {
        headers: { host: "demo.example.com" },
      }),
    );

    expect(res.status).toBe(200);
    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: { id: true },
    });
    expect(state.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-from-slug" },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  });
});
