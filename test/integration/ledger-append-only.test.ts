import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const SETUP_TIMEOUT_MS = 60_000;

// Applies every migration.sql in order against an isolated sqlite file so the
// append-only trigger is exercised exactly as it will run in production,
// without touching the shared dev.db used by `prisma migrate dev`.
function applyMigrations(dbUrl: string): void {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of migrationNames) {
    const file = join(migrationsDir, name, "migration.sql");
    const result = spawnSync("npx", ["prisma", "db", "execute", "--url", dbUrl, "--file", file], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`prisma db execute failed for ${name}: ${result.stdout}\n${result.stderr}`);
    }
  }
}

describe("LedgerEntry append-only trigger (integration)", () => {
  let dir: string;
  let prisma: PrismaClient;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "bukay-ledger-"));
    const dbUrl = `file:${join(dir, "ledger-test.db")}`;
    applyMigrations(dbUrl);
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    "accepts inserts but rejects UPDATE and DELETE against LedgerEntry",
    async () => {
      const tenant = await prisma.tenant.create({
        data: { name: "Acme", slug: `acme-${Date.now()}` },
      });

      const entry = await prisma.ledgerEntry.create({
        data: {
          tenantId: tenant.id,
          entryType: "payment_success",
          direction: "credit",
          grossCents: 5000,
          providerFeeCents: 150,
          platformFeeCents: 100,
          netCents: 4750,
        },
      });

      await expect(
        prisma.$executeRawUnsafe(`UPDATE "LedgerEntry" SET "netCents" = 1 WHERE "id" = ?`, entry.id)
      ).rejects.toThrow();

      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "LedgerEntry" WHERE "id" = ?`, entry.id)
      ).rejects.toThrow();

      const rows = await prisma.ledgerEntry.findMany({ where: { tenantId: tenant.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].netCents).toBe(4750);
    },
    SETUP_TIMEOUT_MS
  );
});
