import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/payments/route";

const db = new PrismaClient();
const tenantId = "payments-route-tenant";
const otherTenantId = "payments-route-other";

function request(status?: string, tenant = tenantId) {
  const params = new URLSearchParams();
  if (status !== undefined) params.set("status", status);
  const query = params.toString();
  return GET(
    new NextRequest(`http://localhost/api/payments${query ? `?${query}` : ""}`, {
      headers: { "x-tenant-id": tenant },
    })
  );
}

let phoneSeq = 0;

async function seedPayment(
  id: string,
  opts: {
    status: string;
    amountCents: number;
    createdAt: Date;
    clientName: string;
    serviceName: string;
  }
) {
  phoneSeq += 1;
  const client = await db.client.create({
    data: {
      tenantId: id,
      name: opts.clientName,
      phone: `+23480000${String(phoneSeq).padStart(5, "0")}`,
    },
  });
  const service = await db.service.create({
    data: {
      tenantId: id,
      name: opts.serviceName,
      durationMinutes: 30,
      priceCents: opts.amountCents,
    },
  });
  const startsAt = opts.createdAt;
  const booking = await db.booking.create({
    data: {
      tenantId: id,
      clientId: client.id,
      serviceId: service.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: "confirmed",
    },
  });
  return db.payment.create({
    data: {
      tenantId: id,
      bookingId: booking.id,
      amountCents: opts.amountCents,
      currency: "NGN",
      status: opts.status,
      paidAt: opts.status === "paid" ? opts.createdAt : null,
      createdAt: opts.createdAt,
    },
  });
}

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });
  for (const id of [tenantId, otherTenantId]) {
    await db.tenant.upsert({ where: { id }, update: {}, create: { id, slug: id, name: id } });
  }
}, 120_000);

beforeEach(async () => {
  await db.payment.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.booking.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.client.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.service.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
});

afterAll(async () => {
  await db.payment.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.booking.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.client.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.service.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await db.$disconnect();
}, 120_000);

describe("GET /api/payments against real SQLite", () => {
  it("returns payments ordered by createdAt descending with client and service names", async () => {
    await seedPayment(tenantId, {
      status: "paid",
      amountCents: 5000,
      createdAt: new Date("2026-06-15T10:00:00.000Z"),
      clientName: "Older Client",
      serviceName: "Classic Haircut",
    });
    await seedPayment(tenantId, {
      status: "pending",
      amountCents: 3000,
      createdAt: new Date("2026-06-16T10:00:00.000Z"),
      clientName: "Newer Client",
      serviceName: "Beard Trim",
    });

    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.payments).toHaveLength(2);
    expect(body.payments.map((p: { createdAt: string }) => p.createdAt)).toEqual([
      "2026-06-16T10:00:00.000Z",
      "2026-06-15T10:00:00.000Z",
    ]);
    expect(body.payments[0]).toMatchObject({
      amountCents: 3000,
      status: "pending",
      booking: { client: { name: "Newer Client" }, service: { name: "Beard Trim" } },
    });
    expect(body.payments[1]).toMatchObject({
      amountCents: 5000,
      status: "paid",
      booking: { client: { name: "Older Client" }, service: { name: "Classic Haircut" } },
    });
  });

  it("filters by status when provided", async () => {
    await seedPayment(tenantId, {
      status: "paid",
      amountCents: 5000,
      createdAt: new Date("2026-06-15T10:00:00.000Z"),
      clientName: "Paid Client",
      serviceName: "Classic Haircut",
    });
    await seedPayment(tenantId, {
      status: "pending",
      amountCents: 3000,
      createdAt: new Date("2026-06-16T10:00:00.000Z"),
      clientName: "Pending Client",
      serviceName: "Beard Trim",
    });

    const response = await request("paid");
    expect(response.status).toBe(200);
    const { payments } = await response.json();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      status: "paid",
      booking: { client: { name: "Paid Client" } },
    });
  });

  it("rejects an unknown status with 422", async () => {
    const response = await request("banana");
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: "invalid_status" });
  });

  it("scopes results to the requesting tenant", async () => {
    await seedPayment(tenantId, {
      status: "paid",
      amountCents: 5000,
      createdAt: new Date("2026-06-15T10:00:00.000Z"),
      clientName: "Mine",
      serviceName: "Classic Haircut",
    });
    await seedPayment(otherTenantId, {
      status: "paid",
      amountCents: 9000,
      createdAt: new Date("2026-06-15T11:00:00.000Z"),
      clientName: "Theirs",
      serviceName: "Other Cut",
    });

    const response = await request(undefined, tenantId);
    const { payments } = await response.json();
    expect(payments).toHaveLength(1);
    expect(payments[0].booking.client.name).toBe("Mine");

    const other = await request(undefined, otherTenantId);
    const otherBody = await other.json();
    expect(otherBody.payments).toHaveLength(1);
    expect(otherBody.payments[0].booking.client.name).toBe("Theirs");
  });

  it("requires tenant context", async () => {
    expect((await GET(new NextRequest("http://localhost/api/payments"))).status).toBe(400);
  });
});
