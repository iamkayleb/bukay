import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/services/route";
import { POST as POST_PUBLIC_BOOKING } from "@/app/api/public/bookings/route";
import { TEST_SESSION_SECRET, tenantRequestHeaders } from "@/__tests__/helpers/tenant-auth";

const db = new PrismaClient();
const victim = "tenant-isolation-victim";
const attacker = "tenant-isolation-attacker";
const publicSlug = "tenant-isolation-public";

const STARTS_AT = "2026-07-27T10:00:00.000Z";
let publicServiceId = "";

beforeAll(async () => {
  vi.stubEnv("SESSION_SECRET", TEST_SESSION_SECRET);
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });

  for (const id of [victim, attacker]) {
    await db.tenant.upsert({
      where: { id },
      update: {},
      create: { id, slug: id, name: id },
    });
  }

  const publicTenant = await db.tenant.upsert({
    where: { slug: publicSlug },
    update: {},
    create: { slug: publicSlug, name: publicSlug },
  });

  await db.service.deleteMany({
    where: { tenantId: { in: [victim, attacker, publicTenant.id] } },
  });

  await db.service.create({
    data: { tenantId: victim, name: "Victim Only", durationMinutes: 30, priceCents: 1000 },
  });

  const publicService = await db.service.create({
    data: {
      tenantId: publicTenant.id,
      name: "Public Service",
      durationMinutes: 30,
      priceCents: 5000,
      active: true,
    },
  });
  publicServiceId = publicService.id;
});

afterAll(async () => {
  await db.service.deleteMany({
    where: { tenantId: { in: [victim, attacker] } },
  });
  const publicTenant = await db.tenant.findUnique({ where: { slug: publicSlug } });
  if (publicTenant) {
    await db.booking.deleteMany({ where: { tenantId: publicTenant.id } });
    await db.service.deleteMany({ where: { tenantId: publicTenant.id } });
    await db.tenant.delete({ where: { id: publicTenant.id } });
  }
  await db.tenant.deleteMany({ where: { id: { in: [victim, attacker] } } });
  await db.$disconnect();
});

describe("merchant tenant isolation", () => {
  it("returns 401 when only x-tenant-id is present", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/services", {
        headers: { "x-tenant-id": victim },
      })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("returns the session tenant rows with a valid session and no header", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/services", {
        headers: tenantRequestHeaders(victim),
      })
    );
    expect(res.status).toBe(200);
    const { services } = await res.json();
    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({ name: "Victim Only", tenantId: victim });
  });

  it("returns 403 when the session and x-tenant-id disagree", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/services", {
        headers: {
          ...tenantRequestHeaders(attacker),
          "x-tenant-id": victim,
        },
      })
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "tenant_forbidden" });
  });
});

describe("public booking path", () => {
  it("accepts POST /api/public/bookings with slug and no session", async () => {
    const res = await POST_PUBLIC_BOOKING(
      new NextRequest("http://localhost/api/public/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: publicSlug,
          serviceId: publicServiceId,
          startsAt: STARTS_AT,
          customerName: "Ada Okonkwo",
          phone: "08031234567",
          sessionId: "tenant-isolation-public-session",
        }),
      })
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });
});