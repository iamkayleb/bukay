import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST, GET } from "@/app/api/bookings/route";

const db = new PrismaClient();
const ids = ["manual-booking-one", "manual-booking-two"];
let serviceId: string;
let foreignServiceId: string;
let foreignClientId: string;
function request(input: Record<string, unknown>, tenantId = ids[0]) {
  return POST(
    new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
      body: JSON.stringify({
        serviceId,
        startsAt: "2026-06-16T10:00:00Z",
        name: "Tunde",
        phone: "08031234567",
        ...input,
      }),
    })
  );
}
beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  for (const id of ids) {
    await db.tenant.create({ data: { id, slug: id, name: id } });
    const service = await db.service.create({
      data: { tenantId: id, name: "Haircut", durationMinutes: 30, priceCents: 5000 },
    });
    if (id === ids[0]) serviceId = service.id;
    else foreignServiceId = service.id;
    for (const dayOfWeek of [1, 2, 3, 4, 5, 6]) {
      await db.businessHour.create({
        data: { tenantId: id, dayOfWeek, opensAt: "09:00", closesAt: "18:00" },
      });
    }
  }
  foreignClientId = (
    await db.client.create({ data: { tenantId: ids[1], name: "Other", phone: "+2348031234567" } })
  ).id;
});
afterAll(async () => {
  await db.booking.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
describe("manual booking creation against real SQLite", () => {
  it("creates a confirmed unpaid booking for Tunde and lists it after reload", async () => {
    const response = await request({ notes: "Phone booking" });
    expect(response.status).toBe(201);
    const { booking } = await response.json();
    expect(
      await db.booking.findUnique({
        where: { id: booking.id },
        include: { client: true, payments: true },
      })
    ).toMatchObject({
      tenantId: ids[0],
      status: "confirmed",
      slotLock: null,
      staffId: null,
      notes: "Phone booking",
      endsAt: new Date("2026-06-16T10:30:00Z"),
      client: { name: "Tunde", phone: "+2348031234567" },
      payments: [],
    });
    const listing = await GET(
      new NextRequest("http://localhost/api/bookings?from=2026-06-16&to=2026-06-16", {
        headers: { "x-tenant-id": ids[0] },
      })
    );
    expect((await listing.json()).bookings.some((b: { id: string }) => b.id === booking.id)).toBe(
      true
    );
  });
  it("rejects the same slot and partial overlaps", async () => {
    expect((await request({})).status).toBe(409);
    // An existing off-grid public reservation must also block a manual slot.
    const original = await db.booking.findFirstOrThrow({ where: { tenantId: ids[0] } });
    await db.booking.update({
      where: { id: original.id },
      data: { endsAt: new Date("2026-06-16T10:45:00Z") },
    });
    expect((await request({ startsAt: "2026-06-16T10:30:00Z" })).status).toBe(409);
  });
  it.each(["2026-06-16T08:00:00Z", "2026-06-16T18:00:00Z", "2026-06-14T10:00:00Z"])(
    "rejects closed hours %s",
    async (startsAt) => {
      expect((await request({ startsAt })).status).toBe(422);
    }
  );
  it("reuses an existing normalized phone and supports clientId", async () => {
    expect(
      (await request({ startsAt: "2026-06-16T11:00:00Z", phone: "+2348031234567" })).status
    ).toBe(201);
    const client = await db.client.findFirstOrThrow({ where: { tenantId: ids[0] } });
    expect(await db.client.count({ where: { tenantId: ids[0] } })).toBe(1);
    expect(
      (
        await request({
          startsAt: "2026-06-16T12:00:00Z",
          clientId: client.id,
          name: undefined,
          phone: undefined,
        })
      ).status
    ).toBe(201);
  });
  it("scopes service, client, phone reuse and conflicts to the current tenant", async () => {
    expect((await request({ serviceId: foreignServiceId })).status).toBe(404);
    expect(
      (await request({ startsAt: "2026-06-16T13:00:00Z", clientId: foreignClientId })).status
    ).toBe(404);
    expect((await request({ serviceId: foreignServiceId }, ids[1])).status).toBe(201);
    expect(await db.client.count({ where: { tenantId: ids[1] } })).toBe(1);
  });
  it("allows only one of two simultaneous requests for the same slot", async () => {
    const results = await Promise.all([
      request({ startsAt: "2026-06-16T14:00:00Z" }),
      request({ startsAt: "2026-06-16T14:00:00Z" }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      await db.booking.count({
        where: { tenantId: ids[0], startsAt: new Date("2026-06-16T14:00:00Z") },
      })
    ).toBe(1);
  });
  it("validates the payload without creating clients", async () => {
    expect((await request({ startsAt: "bad" })).status).toBe(422);
    expect((await request({ phone: "bad" })).status).toBe(422);
    expect((await request({ name: undefined, phone: undefined })).status).toBe(422);
  });
});
