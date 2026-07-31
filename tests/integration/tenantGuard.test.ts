/**
 * Integration tests for the tenant-guard Prisma extension.
 *
 * Verifies that cross-tenant queries against a real Postgres database go
 * through the extension and throw a tenant guard error. Requires a live
 * Postgres reachable via DATABASE_URL — skipped otherwise so unit CI stays
 * fast.
 *
 * NOTE: `runWithTenantContext` callbacks are declared `async () => await …`
 * so the AsyncLocalStorage store propagates into Prisma's internal promise
 * chain. A synchronous callback that returns a Prisma promise loses the
 * store before the extension runs.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenantContext } from "@/app/tenancy/tenant-context";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const HAS_POSTGRES =
  DATABASE_URL.startsWith("postgresql://") || DATABASE_URL.startsWith("postgres://");
const suite = HAS_POSTGRES ? describe : describe.skip;

type PrismaClientLike = {
  tenant: {
    create: (a: unknown) => Promise<{ id: string }>;
    deleteMany: (a: unknown) => Promise<unknown>;
  };
  service: {
    create: (a: unknown) => Promise<{ id: string; tenantId: string }>;
    findMany: (a: unknown) => Promise<Array<{ tenantId: string }>>;
    update: (a: unknown) => Promise<unknown>;
    deleteMany: (a: unknown) => Promise<unknown>;
  };
  $disconnect: () => Promise<void>;
};

suite("tenant guard integration — cross-tenant queries throw", () => {
  let prisma: PrismaClientLike;
  let tenantAId: string;
  let tenantBId: string;
  let tenantAServiceId: string;
  let tenantBServiceId: string;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { tenantGuardExtension } = await import("@/prisma/extension");
    prisma = new PrismaClient().$extends(tenantGuardExtension) as unknown as PrismaClientLike;

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const tenantA = await prisma.tenant.create({
      data: { slug: `guard-a-${suffix}`, name: "Guard Tenant A" },
    });
    const tenantB = await prisma.tenant.create({
      data: { slug: `guard-b-${suffix}`, name: "Guard Tenant B" },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const svcA = await prisma.service.create({
      data: {
        tenantId: tenantAId,
        name: "Tenant A Service",
        durationMinutes: 30,
        priceCents: 5000,
      },
    });
    const svcB = await prisma.service.create({
      data: {
        tenantId: tenantBId,
        name: "Tenant B Service",
        durationMinutes: 30,
        priceCents: 5000,
      },
    });
    tenantAServiceId = svcA.id;
    tenantBServiceId = svcB.id;
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    // These deleteMany calls don't run through a tenant context — the
    // extension will reject them because they don't carry a top-level
    // tenantId. Do the cleanup with `id` predicates in per-tenant context.
    await runWithTenantContext({ tenantId: tenantAId }, async () => {
      await prisma.service.deleteMany({
        where: { tenantId: tenantAId, id: tenantAServiceId },
      });
    });
    await runWithTenantContext({ tenantId: tenantBId }, async () => {
      await prisma.service.deleteMany({
        where: { tenantId: tenantBId, id: tenantBServiceId },
      });
    });
    // Tenant isn't a tenant-scoped model, so it bypasses the guard.
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("blocks Service.findMany that reads tenant B while context is tenant A", async () => {
    await expect(
      runWithTenantContext({ tenantId: tenantAId }, async () => {
        return await prisma.service.findMany({ where: { tenantId: tenantBId } });
      })
    ).rejects.toThrow(/tenantId does not match the active tenant context/);
  });

  it("blocks Service.findMany that omits tenantId in where", async () => {
    await expect(
      runWithTenantContext({ tenantId: tenantAId }, async () => {
        return await prisma.service.findMany({ where: {} });
      })
    ).rejects.toThrow(/requires a top-level tenantId in where/);
  });

  it("allows Service.findMany when tenantId matches the active context", async () => {
    const rows = await runWithTenantContext({ tenantId: tenantAId }, async () => {
      return await prisma.service.findMany({ where: { tenantId: tenantAId } });
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tenantId).toBe(tenantAId);
    }
  });

  it("blocks Service.update when the where's tenantId disagrees with context", async () => {
    await expect(
      runWithTenantContext({ tenantId: tenantAId }, async () => {
        return await prisma.service.update({
          where: { tenantId: tenantBId, id: tenantBServiceId },
          data: { name: "attempted rename" },
        });
      })
    ).rejects.toThrow(/tenantId does not match the active tenant context/);
  });
});
