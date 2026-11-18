import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/clients/route";
import { GET as GET_ONE } from "@/app/api/clients/[id]/route";
import { submitCreateClientForm } from "@/app/(app)/clients/client-form";
import { ClientsList } from "@/app/(app)/clients/clients-list";
import { getTenantClientWithBookings } from "@/app/(app)/clients/data";

// Real SQLite and the application's guarded Prisma client; no delegate mocks.
vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-tenant-id": "clients-route-integration" }),
}));

const db = new PrismaClient();
const tenantId = "clients-route-integration";
const otherTenantId = "clients-route-other";
const tenants = [tenantId, otherTenantId];

function request(body?: unknown, method = "POST", tenant = tenantId) {
  return new NextRequest("http://localhost/api/clients", {
    method,
    headers: { "x-tenant-id": tenant, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const ada = { name: "Ada", phone: "08061778668" };
const context = (id: string) => ({ params: { id } });

async function clearTenantRows() {
  await db.booking.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.client.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.service.deleteMany({ where: { tenantId: { in: tenants } } });
}

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });
  for (const id of tenants) {
    await db.tenant.upsert({ where: { id }, update: {}, create: { id, slug: id, name: id } });
  }
});
beforeEach(clearTenantRows);
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await clearTenantRows();
  await db.tenant.deleteMany({ where: { id: { in: tenants } } });
  await db.$disconnect();
});

describe("clients routes against SQLite", () => {
  it("creates the acceptance payload with a normalized phone and persists the row", async () => {
    const res = await POST(request(ada));
    expect(res.status).toBe(201);
    const { client } = await res.json();
    expect(client).toMatchObject({ name: "Ada", phone: "+2348061778668", tenantId });
    expect(await db.client.findUnique({ where: { id: client.id } })).toMatchObject({
      tenantId,
      name: "Ada",
      phone: "+2348061778668",
    });
  });

  it("lists the tenant's clients ordered by name", async () => {
    for (const [name, phone] of [
      ["Zainab", "08030000001"],
      ["Ada", "08030000002"],
      ["Bola", "08030000003"],
    ]) {
      expect((await POST(request({ name, phone }))).status).toBe(201);
    }
    const res = await GET(request(undefined, "GET"));
    expect(res.status).toBe(200);
    const { clients } = await res.json();
    expect(clients.map((client: { name: string }) => client.name)).toEqual([
      "Ada",
      "Bola",
      "Zainab",
    ]);
  });

  it("returns 409 for a duplicate phone in the same tenant, in any accepted format", async () => {
    expect((await POST(request(ada))).status).toBe(201);
    const duplicate = await POST(request(ada));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ ok: false, error: "client_phone_conflict" });
    expect((await POST(request({ name: "Ada again", phone: "+234 806 177 8668" }))).status).toBe(
      409
    );
    expect(await db.client.count({ where: { tenantId } })).toBe(1);
  });

  it("rejects missing names and invalid phones without writing", async () => {
    const res = await POST(request({ name: " ", phone: "12345" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.fieldErrors.name).toEqual(["Name is required"]);
    expect(body.fieldErrors.phone).toEqual(["Enter a valid Nigerian mobile number"]);
    expect((await POST(request({ ...ada, extra: true }))).status).toBe(422);
    expect(await db.client.count({ where: { tenantId } })).toBe(0);
  });

  it("scopes listing, lookup and the phone constraint to the tenant", async () => {
    const { client } = await (await POST(request(ada))).json();
    expect((await POST(request(ada, "POST", otherTenantId))).status).toBe(201);

    const otherList = await (await GET(request(undefined, "GET", otherTenantId))).json();
    expect(otherList.clients).toHaveLength(1);
    expect(otherList.clients[0].id).not.toBe(client.id);
    expect(otherList.clients[0].tenantId).toBe(otherTenantId);

    const crossTenant = await GET_ONE(request(undefined, "GET", otherTenantId), context(client.id));
    expect(crossTenant.status).toBe(404);
    expect(await getTenantClientWithBookings(otherTenantId, client.id)).toBeNull();
  });

  it("returns one client with bookings newest first, or an empty history", async () => {
    const { client } = await (await POST(request(ada))).json();
    const empty = await GET_ONE(request(undefined, "GET"), context(client.id));
    expect(empty.status).toBe(200);
    expect((await empty.json()).bookings).toEqual([]);

    const service = await db.service.create({
      data: { tenantId, name: "Braids", durationMinutes: 60, priceCents: 500000 },
    });
    for (const startsAt of ["2026-11-01T09:00:00.000Z", "2026-11-20T09:00:00.000Z"]) {
      await db.booking.create({
        data: {
          tenantId,
          clientId: client.id,
          serviceId: service.id,
          startsAt: new Date(startsAt),
          endsAt: new Date(new Date(startsAt).getTime() + 3_600_000),
        },
      });
    }

    const res = await GET_ONE(request(undefined, "GET"), context(client.id));
    const body = await res.json();
    expect(body.client).toMatchObject({ id: client.id, name: "Ada" });
    expect(body.bookings.map((booking: { startsAt: string }) => booking.startsAt)).toEqual([
      "2026-11-20T09:00:00.000Z",
      "2026-11-01T09:00:00.000Z",
    ]);
    expect(body.bookings[0].service).toEqual({ id: service.id, name: "Braids" });
    expect((await GET_ONE(request(undefined, "GET"), context("missing"))).status).toBe(404);
  });

  it("submits the form through the real route and renders the reloaded database list", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
      POST(
        new NextRequest("http://localhost/api/clients", {
          method: init.method,
          body: init.body,
          headers: { "content-type": "application/json", "x-tenant-id": tenantId },
        })
      )
    );
    const result = await submitCreateClientForm(ada);
    expect(result.ok).toBe(true);

    const markup = renderToStaticMarkup(await ClientsList());
    expect(markup).toContain("Ada");
    expect(markup).toContain("+2348061778668");
    expect(markup).toContain(`href="/clients/${result.ok ? result.client.id : ""}"`);

    const duplicate = await submitCreateClientForm(ada);
    expect(duplicate).toEqual({
      ok: false,
      error: "client_phone_conflict",
      fieldErrors: { phone: "A client with this phone number already exists" },
    });
  });

  it("validates the form before calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await submitCreateClientForm({ name: "", phone: "0806" })).toEqual({
      ok: false,
      error: "validation_failed",
      fieldErrors: {
        name: "Name is required",
        phone: "Enter a valid Nigerian mobile number",
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
