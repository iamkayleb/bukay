import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/services/route";
import { TEST_SESSION_SECRET, tenantRequestHeaders } from "@/__tests__/helpers/tenant-auth";

const db = new PrismaClient();
const victim = "tenant-header-victim";
const attacker = "tenant-header-attacker";

beforeAll(async () => {
  vi.stubEnv("SESSION_SECRET", TEST_SESSION_SECRET);
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    stdio: "pipe",
  });
  for (const id of [victim, attacker]) {
    await db.tenant.upsert({ where: { id }, update: {}, create: { id, slug: id, name: id } });
  }
  await db.service.create({
    data: { tenantId: victim, name: "Secret", durationMinutes: 30, priceCents: 1000 },
  });
});

afterAll(async () => {
  await db.service.deleteMany({ where: { tenantId: { in: [victim, attacker] } } });
  await db.tenant.deleteMany({ where: { id: { in: [victim, attacker] } } });
  await db.$disconnect();
});

describe("untrusted x-tenant-id header", () => {
  it("does not return another tenant's data when only the header is present", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/services", {
        headers: { "x-tenant-id": victim },
      })
    );
    expect(res.status).toBe(401);
  });

  it("uses the session tenant, not the header, when both are present", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/services", {
        headers: {
          ...tenantRequestHeaders(attacker),
          "x-tenant-id": victim,
        },
      })
    );
    expect(res.status).toBe(200);
    const { services } = await res.json();
    expect(services).toEqual([]);
  });
});