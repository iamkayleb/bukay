import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tenantGuardExtension } from "@/app/db/tenant-guard";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

const databaseUrl = process.env.TENANT_SCOPING_DATABASE_URL;
const runWithPostgres =
  databaseUrl?.startsWith("postgresql://") || databaseUrl?.startsWith("postgres://");
const describeWithPostgres = runWithPostgres ? describe : describe.skip;

let basePrisma: PrismaClient;
let prisma: PrismaClient;

function getBasePrisma() {
  basePrisma ??= new PrismaClient({ datasourceUrl: databaseUrl });
  return basePrisma;
}

function getPrisma() {
  prisma ??= getBasePrisma().$extends(tenantGuardExtension) as unknown as PrismaClient;
  return prisma;
}

async function resetDatabase() {
  await getBasePrisma().$executeRawUnsafe(`
    DROP TABLE IF EXISTS "Service";
    DROP TABLE IF EXISTS "Tenant";

    CREATE TABLE "Tenant" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
      "currency" TEXT NOT NULL DEFAULT 'NGN',
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

    CREATE TABLE "Service" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "durationMinutes" INTEGER NOT NULL,
      "priceCents" INTEGER NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Service_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE UNIQUE INDEX "Service_tenantId_name_key" ON "Service"("tenantId", "name");
    CREATE INDEX "Service_tenantId_idx" ON "Service"("tenantId");
  `);
}

describeWithPostgres("tenant-scoped Prisma queries", () => {
  beforeAll(async () => {
    await resetDatabase();

    await getBasePrisma().tenant.createMany({
      data: [
        { id: "tenant-current", name: "Current Tenant", slug: "current" },
        { id: "tenant-other", name: "Other Tenant", slug: "other" },
      ],
    });
    await getBasePrisma().service.createMany({
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
    await getPrisma().$disconnect();
  });

  it("returns only the row matching the active tenant context", async () => {
    const services = await runWithTenantContext({ tenantId: "tenant-current" }, () =>
      getPrisma().service.findMany({
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
