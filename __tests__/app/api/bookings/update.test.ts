import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PATCH } from "@/app/api/bookings/[id]/route";

const db = new PrismaClient();
const tenants = ["patch-tenant-a", "patch-tenant-b"];
let serviceId: string;
let otherServiceId: string;
let clientId: string;

function patchRequest(id: string, body: Record<string, unknown>, tenantId: string) {
  return PATCH(
    new NextRequest(`http://localhost/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );
}

async function createBooking(startsAt: string, tenantId = tenants[0], status = "confirmed") {
  return db.booking.create({
    data: {
      tenantId,
      serviceId: tenantId === tenants[0] ? serviceId : otherServiceId,
      clientId:
        tenantId === tenants[0]
          ? clientId
          : (
              await db.client.findFirstOrThrow({
                where: { tenantId: tenants[1] },
              })
            ).id,
      startsAt: new Date(startsAt),
      endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000),
      status,
    },
  });
}

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  for (const tenantId of tenants) {
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: tenantId } });
    const service = await db.service.create({
      data: { tenantId, name: "Cut", durationMinutes: 30, priceCents: 5000 },
    });
    if (tenantId === tenants[0]) serviceId = service.id;
    else otherServiceId = service.id;
    for (const dayOfWeek of [0, 1, 2, 3, 4, 5, 6]) {
      await db.businessHour.create({
        data: { tenantId, dayOfWeek, opensAt: "08:00", closesAt: "20:00" },
      });
    }
    if (tenantId === tenants[0]) {
      clientId = (
        await db.client.create({
          data: { tenantId, name: "Ada", phone: "+2348011111111" },
        })
      ).id;
    } else {
      await db.client.create({
        data: { tenantId, name: "Other", phone: "+2348022222222" },
      });
    }
  }
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.client.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.service.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.businessHour.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.tenant.deleteMany({ where: { id: { in: tenants } } });
  await db.$disconnect();
});

describe("PATCH /api/bookings/:id against real SQLite", () => {
  it("cancels a booking and persists cancelled status", async () => {
    const booking = await createBooking("2026-06-15T10:00:00.000Z");
    const response = await patchRequest(booking.id, { status: "cancelled" }, tenants[0]);
    expect(response.status).toBe(200);
    expect((await db.booking.findUnique({ where: { id: booking.id } }))?.status).toBe("cancelled");
  });

  it("marks a booking as no_show", async () => {
    const booking = await createBooking("2026-06-15T12:00:00.000Z");
    const response = await patchRequest(booking.id, { status: "no_show" }, tenants[0]);
    expect(response.status).toBe(200);
    expect((await db.booking.findUnique({ where: { id: booking.id } }))?.status).toBe("no_show");
  });

  it("marks a booking as completed", async () => {
    const booking = await createBooking("2026-06-15T11:30:00.000Z");
    const response = await patchRequest(booking.id, { status: "completed" }, tenants[0]);
    expect(response.status).toBe(200);
    expect((await db.booking.findUnique({ where: { id: booking.id } }))?.status).toBe("completed");
  });

  it("confirms a pending booking", async () => {
    const booking = await createBooking("2026-06-15T16:30:00.000Z", tenants[0], "pending");
    const response = await patchRequest(booking.id, { status: "confirmed" }, tenants[0]);
    expect(response.status).toBe(200);
    expect((await db.booking.findUnique({ where: { id: booking.id } }))?.status).toBe("confirmed");
  });

  it("rejects an unknown status with 422 and leaves the row unchanged", async () => {
    const booking = await createBooking("2026-06-15T13:00:00.000Z");
    const response = await patchRequest(booking.id, { status: "maybe" }, tenants[0]);
    expect(response.status).toBe(422);
    expect((await db.booking.findUnique({ where: { id: booking.id } }))?.status).toBe("confirmed");
  });

  it("rejects reschedule onto an occupied slot for the same service with 409", async () => {
    await createBooking("2026-06-15T10:00:00.000Z");
    const movable = await createBooking("2026-06-15T11:00:00.000Z");
    const response = await patchRequest(
      movable.id,
      { startsAt: "2026-06-15T10:15:00.000Z" },
      tenants[0]
    );
    expect(response.status).toBe(409);
    const row = await db.booking.findUniqueOrThrow({ where: { id: movable.id } });
    expect(row.startsAt.toISOString()).toBe("2026-06-15T11:00:00.000Z");
  });

  it("recomputes endsAt from service duration when startsAt changes", async () => {
    const booking = await createBooking("2026-06-15T14:00:00.000Z");
    const response = await patchRequest(
      booking.id,
      { startsAt: "2026-06-15T15:00:00.000Z" },
      tenants[0]
    );
    expect(response.status).toBe(200);
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.startsAt.toISOString()).toBe("2026-06-15T15:00:00.000Z");
    expect(row.endsAt.toISOString()).toBe("2026-06-15T15:30:00.000Z");
  });

  it("returns 404 when the booking belongs to another tenant", async () => {
    const foreign = await createBooking("2026-06-15T16:00:00.000Z", tenants[1]);
    const response = await patchRequest(foreign.id, { status: "cancelled" }, tenants[0]);
    expect(response.status).toBe(404);
    expect((await db.booking.findUnique({ where: { id: foreign.id } }))?.status).toBe("confirmed");
  });
});
