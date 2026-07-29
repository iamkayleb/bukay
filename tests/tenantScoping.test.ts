import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tenantGuardExtension } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase =
  process.env.RUN_LIVE_DATABASE_TESTS === "1" && databaseUrl?.startsWith("postgres")
    ? describe
    : describe.skip;

const basePrisma = new PrismaClient({
  datasourceUrl: databaseUrl ?? "postgresql://user:pass@localhost:5432/bukay",
});
const prisma = basePrisma.$extends(tenantGuardExtension);

async function resetDatabase() {
  await basePrisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Service"`);
  await basePrisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Tenant" CASCADE`);
  await basePrisma.$executeRawUnsafe(`
    CREATE TABLE "Tenant" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
      "currency" TEXT NOT NULL DEFAULT 'NGN',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await basePrisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug")`);
  await basePrisma.$executeRawUnsafe(`
    CREATE TABLE "Service" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "durationMinutes" INTEGER NOT NULL,
      "priceCents" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'NGN',
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Service_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await basePrisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "Service_tenantId_name_key" ON "Service"("tenantId", "name")`
  );
  await basePrisma.$executeRawUnsafe(`CREATE INDEX "Service_tenantId_idx" ON "Service"("tenantId")`);
}

describeWithDatabase("tenant-scoped Prisma queries", () => {
  beforeAll(async () => {
    await resetDatabase();

    await basePrisma.tenant.createMany({
      data: [
        { id: "tenant-current", name: "Current Tenant", slug: "current" },
        { id: "tenant-other", name: "Other Tenant", slug: "other" },
      ],
    });
    await basePrisma.service.createMany({
      data: [
        {
          id: "service-current",
          tenantId: "tenant-current",
          name: "Braids",
          durationMinutes: 90,
          priceCents: 15000,
        },
        {
          id: "service-other",
          tenantId: "tenant-other",
          name: "Braids",
          durationMinutes: 90,
          priceCents: 15000,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only the row matching the active tenant context", async () => {
    const services = await runWithTenantContext({ tenantId: "tenant-current" }, () =>
      prisma.service.findMany({
        where: { tenantId: "tenant-current", name: "Braids" },
        orderBy: { id: "asc" },
      })
    );

    expect(services).toHaveLength(1);
    expect(services[0]).toMatchObject({
      id: "service-current",
      tenantId: "tenant-current",
      name: "Braids",
    });
  });
});
