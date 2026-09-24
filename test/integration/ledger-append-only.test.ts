import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Exercises the append-only DB trigger from
 * prisma/migrations/20260924134058_ledger_entry_append_only_trigger against
 * a real (throwaway) SQLite database, since the mocked @/app/db/prisma
 * client used by the rest of the suite can't prove a database-level
 * constraint actually fires. The schema/migrations are copied into a temp
 * dir and applied there via `prisma migrate deploy` so this never touches
 * the shared prisma/dev.db used for local development.
 */

const workDir = mkdtempSync(join(tmpdir(), "bukay-ledger-append-only-"));
const dbPath = join(workDir, "test.db");
const schemaPath = join(workDir, "schema.prisma");
const prismaBin = join(process.cwd(), "node_modules", ".bin", "prisma");

let prisma: PrismaClient;
let entryId: string;

beforeAll(async () => {
  cpSync(join(process.cwd(), "prisma", "migrations"), join(workDir, "migrations"), {
    recursive: true,
  });

  const schemaSource = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const schemaForTest = schemaSource.replace(
    /url\s*=\s*"file:\.\/dev\.db"/,
    `url      = "file:${dbPath}"`
  );
  writeFileSync(schemaPath, schemaForTest);

  execFileSync(prismaBin, ["migrate", "deploy", "--schema", schemaPath], {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });

  const tenant = await prisma.tenant.create({
    data: { name: "Ledger Append-Only Test Tenant", slug: `ledger-test-${randomUUID()}` },
  });

  const entry = await prisma.ledgerEntry.create({
    data: {
      tenantId: tenant.id,
      type: "payment_success",
      amountCents: 1000,
      currency: "NGN",
      sourceRef: `append-only-${randomUUID()}`,
    },
  });
  entryId = entry.id;
}, 30_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(workDir, { recursive: true, force: true });
});

describe("LedgerEntry append-only DB trigger", () => {
  it("rejects a direct SQL UPDATE against LedgerEntry", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        'UPDATE "LedgerEntry" SET "amountCents" = 999 WHERE "id" = ?',
        entryId
      )
    ).rejects.toThrow();

    const row = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.amountCents).toBe(1000);
  });

  it("rejects a direct SQL DELETE against LedgerEntry", async () => {
    await expect(
      prisma.$executeRawUnsafe('DELETE FROM "LedgerEntry" WHERE "id" = ?', entryId)
    ).rejects.toThrow();

    const row = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.id).toBe(entryId);
  });

  it("rejects Prisma's typed update() and delete() calls too", async () => {
    await expect(
      prisma.ledgerEntry.update({ where: { id: entryId }, data: { amountCents: 1 } })
    ).rejects.toThrow();
    await expect(prisma.ledgerEntry.delete({ where: { id: entryId } })).rejects.toThrow();

    const row = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.amountCents).toBe(1000);
  });
});
