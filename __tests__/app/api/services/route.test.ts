import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/services/route";
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/services/[id]/route";
import { submitCreateServiceForm } from "@/app/(app)/services/service-form";

// Real SQLite and the application's guarded Prisma client; no delegate mocks.
vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-tenant-id": "services-route-integration" }),
}));
import { ServicesList } from "@/app/(app)/services/services-list";
import { renderToStaticMarkup } from "react-dom/server";

const db = new PrismaClient();
const tenantId = "services-route-integration";
const otherTenantId = "services-route-other";
function request(body?: unknown, method = "POST", tenant = tenantId) {
  return new NextRequest("http://localhost/api/services", {
    method,
    headers: { "x-tenant-id": tenant, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const input = { name: "Haircut", durationMinutes: 30, priceKobo: 500000, bufferMinutes: 10 };
const context = (id: string) => ({ params: { id } });

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });
  for (const id of [tenantId, otherTenantId]) {
    await db.tenant.upsert({ where: { id }, update: {}, create: { id, slug: id, name: id } });
  }
});
beforeEach(async () => {
  await db.service.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await db.$disconnect();
});

describe("services routes against SQLite", () => {
  it("submits the naira form through the real route and renders the reloaded database list", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
      POST(
        new NextRequest("http://localhost/api/services", {
          method: init.method,
          body: init.body,
          headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        })
      )
    );
    const result = await submitCreateServiceForm({
      name: "Haircut",
      durationMinutes: "30",
      priceNaira: "5000",
      bufferMinutes: "10",
      active: true,
    });
    expect(result.ok).toBe(true);
    const markup = renderToStaticMarkup(await ServicesList());
    expect(markup).toContain("Haircut");
    expect(markup).toContain("5,000.00");
    expect(markup).toContain("10 min buffer");
  });
  it("creates the acceptance payload and reloads its persisted price and buffer", async () => {
    const res = await POST(request(input));
    expect(res.status).toBe(201);
    const { service } = await res.json();
    expect(service).toMatchObject({ ...input, tenantId, active: true });
    expect(service).not.toHaveProperty("priceCents");
    expect(await db.service.findUnique({ where: { id: service.id } })).toMatchObject({
      priceCents: 500000,
      bufferMinutes: 10,
    });
    const reloaded = await GET(request(undefined, "GET"));
    expect((await reloaded.json()).services).toEqual([service]);
    expect(
      (await (await GET_ONE(request(undefined, "GET"), context(service.id))).json()).service
    ).toEqual(service);
  });

  it("stores defaults for omitted optional fields", async () => {
    const res = await POST(request({ name: "Default", durationMinutes: 30, priceKobo: 0 }));
    expect(res.status).toBe(201);
    expect((await res.json()).service).toMatchObject({ bufferMinutes: 0, active: true });
  });

  it("updates price and buffer without passing wire columns to Prisma", async () => {
    const { service } = await (await POST(request(input))).json();
    const res = await PATCH(
      request({ priceKobo: "900000", bufferMinutes: 15 }, "PATCH"),
      context(service.id)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).service).toMatchObject({ priceKobo: 900000, bufferMinutes: 15 });
    expect(await db.service.findUnique({ where: { id: service.id } })).toMatchObject({
      priceCents: 900000,
      bufferMinutes: 15,
    });
    expect((await PATCH(request({ name: "Renamed" }, "PATCH"), context(service.id))).status).toBe(
      200
    );
    expect((await DELETE(request(undefined, "DELETE"), context(service.id))).status).toBe(200);
    expect(await db.service.findUnique({ where: { id: service.id } })).toMatchObject({
      active: false,
      priceCents: 900000,
    });
  });

  it("rejects negative buffers on create and update without modifying rows", async () => {
    expect((await POST(request({ ...input, bufferMinutes: -5 }))).status).toBe(422);
    expect(await db.service.count({ where: { tenantId } })).toBe(0);
    const { service } = await (await POST(request(input))).json();
    expect((await PATCH(request({ bufferMinutes: -5 }, "PATCH"), context(service.id))).status).toBe(
      422
    );
    expect((await PATCH(request({}, "PATCH"), context(service.id))).status).toBe(422);
    expect(await db.service.findUnique({ where: { id: service.id } })).toMatchObject({
      bufferMinutes: 10,
    });
  });

  it("enforces tenant isolation and duplicate names", async () => {
    const { service } = await (await POST(request(input))).json();
    expect((await POST(request(input))).status).toBe(409);
    expect((await POST(request(input, "POST", otherTenantId))).status).toBe(201);
    expect(
      (await GET_ONE(request(undefined, "GET", otherTenantId), context(service.id))).status
    ).toBe(404);
    expect(
      (await PATCH(request({ name: "Wrong" }, "PATCH", otherTenantId), context(service.id))).status
    ).toBe(404);
    expect(
      (await DELETE(request(undefined, "DELETE", otherTenantId), context(service.id))).status
    ).toBe(404);
    const { service: second } = await (await POST(request({ ...input, name: "Other" }))).json();
    expect((await PATCH(request({ name: input.name }, "PATCH"), context(second.id))).status).toBe(
      409
    );
  });
});
