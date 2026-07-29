// Integration test for the Prisma schema, migration, and seed pipeline.
//
// Copies prisma/ to a fresh temp directory so `prisma migrate dev` and
// `prisma db seed` run against a disposable SQLite database. Then asserts:
//
//   (a) `prisma migrate dev` exits with code 0 and prints no error keywords.
//   (b) The set of applied migrations recorded in the `_prisma_migrations`
//       table exactly matches the set of migration folders under
//       `prisma/migrations` — no drift, no missing rows, no unexpected
//       migrations recorded.
//   (c) After `prisma db seed`, every seeded model (Tenant, User, Service,
//       Staff, StaffService, BusinessHour, Blackout, Client, Booking,
//       Payment, AuditLog) contains the expected row count and content for
//       the demo tenant.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const PRISMA_BIN = join(ROOT, "node_modules", ".bin", "prisma");
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

// Every tenant-scoped model whose @@index([tenantId]) directive is required
// by the multi-tenant scoping invariant. Kept in sync with the tables listed
// in the acceptance criteria and in docs/DATA_MODEL.md.
const TENANT_SCOPED_MODELS = [
  "AuditLog",
  "Blackout",
  "Booking",
  "BusinessHour",
  "Client",
  "Payment",
  "Service",
  "Staff",
  "StaffService",
  "User",
] as const;

const canRun = existsSync(PRISMA_BIN);
const suite = canRun ? describe : describe.skip;

function listMigrationFolders(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .filter((name) => existsSync(join(MIGRATIONS_DIR, name, "migration.sql")))
    .sort();
}

suite("prisma migrate + seed (integration)", () => {
  let projectDir: string;
  let prismaDir: string;
  let dbPath: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(() => {
    projectDir = mkdtempSync(join(tmpdir(), "bukay-prisma-"));
    prismaDir = join(projectDir, "prisma");
    cpSync(join(ROOT, "prisma"), prismaDir, { recursive: true });

    // Remove any prebuilt dev.db copied over so migrate starts from empty.
    const staleDb = join(prismaDir, "dev.db");
    if (existsSync(staleDb)) rmSync(staleDb);

    dbPath = join(prismaDir, "dev.db");
    // `prisma db seed` shells out to `tsx prisma/seed.ts`; add node_modules/.bin
    // to PATH so the child process can find tsx and prisma binaries.
    const nmBin = join(ROOT, "node_modules", ".bin");
    const currentPath = process.env.PATH ?? "";
    env = {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
      PATH: `${nmBin}:${currentPath}`,
    };

    // Give the seed script a package.json + node_modules symlink so
    // `prisma db seed` (which runs `tsx prisma/seed.ts`) resolves.
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify({
        name: "bukay-prisma-integration",
        private: true,
        prisma: { seed: "tsx prisma/seed.ts" },
      })
    );
    const nmLink = join(projectDir, "node_modules");
    if (!existsSync(nmLink)) {
      symlinkSync(join(ROOT, "node_modules"), nmLink, "dir");
    }
  });

  afterAll(() => {
    if (projectDir && existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("prisma migrate dev applies every checked-in migration with no errors", () => {
    const result = spawnSync(
      PRISMA_BIN,
      [
        "migrate",
        "dev",
        "--schema",
        join(prismaDir, "schema.prisma"),
        "--skip-seed",
        "--skip-generate",
      ],
      { cwd: projectDir, env, encoding: "utf8", timeout: 90_000 }
    );

    const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    // (a) migrate exits with code 0
    expect(result.status, combined).toBe(0);
    // (b) no error keywords emitted
    expect(combined.toLowerCase()).not.toMatch(/\berror\b|\bfailed\b|migration engine panicked/);
    expect(existsSync(dbPath)).toBe(true);
  });

  it("every tenant-scoped model has an explicit single-column tenantId index", async () => {
    // Directly validates acceptance criterion #1 at the DB level: every
    // tenant-scoped model's @@index([tenantId]) directive must materialize
    // as an actual single-column SQLite index. A composite index from
    // `@@unique([tenantId, x])` also contains tenantId, so we assert the
    // exact Prisma-emitted name (`{Model}_tenantId_idx`) to catch cases
    // where the explicit `@@index([tenantId])` was silently dropped but a
    // composite tenantId index still exists.
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
    });
    try {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE '%_tenantId_idx'`
      )) as Array<{ name: string }>;
      const indexNames = new Set(rows.map((r) => r.name));
      for (const model of TENANT_SCOPED_MODELS) {
        const expected = `${model}_tenantId_idx`;
        expect(
          indexNames.has(expected),
          `expected explicit single-column index ${expected}; saw: ${[...indexNames].sort().join(", ")}`
        ).toBe(true);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("_prisma_migrations rows match the checked-in migration folders exactly", async () => {
    const generate = spawnSync(
      PRISMA_BIN,
      ["generate", "--schema", join(prismaDir, "schema.prisma")],
      { cwd: projectDir, env, encoding: "utf8", timeout: 90_000 }
    );
    expect(generate.status, `${generate.stdout}\n${generate.stderr}`).toBe(0);

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
    });
    try {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`
      )) as Array<{ migration_name: string }>;
      const applied = rows.map((r) => r.migration_name).sort();
      const onDisk = listMigrationFolders();

      // (c) the applied set matches the on-disk set exactly
      expect(applied).toEqual(onDisk);
      // Extras and missing surface with a clear diff on failure.
      const missing = onDisk.filter((m) => !applied.includes(m));
      const extra = applied.filter((m) => !onDisk.includes(m));
      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("prisma db seed populates every seeded model for the demo tenant", async () => {
    const seed = spawnSync(
      PRISMA_BIN,
      ["db", "seed", "--schema", join(prismaDir, "schema.prisma")],
      { cwd: projectDir, env, encoding: "utf8", timeout: 90_000 }
    );
    expect(seed.status, `${seed.stdout}\n${seed.stderr}`).toBe(0);

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
    });
    try {
      const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
      expect(tenant).not.toBeNull();
      expect(tenant!.slug).toBe("demo");
      const tenantId = tenant!.id;

      const users = await prisma.user.findMany({
        where: { tenantId },
        orderBy: { email: "asc" },
      });
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe("owner@demo.bukay.dev");
      expect(users[0].role).toBe("owner");

      const services = await prisma.service.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });
      expect(services).toHaveLength(3);
      expect(services.map((s) => s.name).sort()).toEqual(
        ["Beard Trim", "Classic Haircut", "Full Grooming Package"].sort()
      );

      const staffRows = await prisma.staff.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });
      expect(staffRows).toHaveLength(1);
      expect(staffRows[0].name).toBe("Demo Owner");
      expect(staffRows[0].phone).toBe("+2348000000001");
      const staffId = staffRows[0].id;

      const staffServices = await prisma.staffService.findMany({
        where: { tenantId },
      });
      expect(staffServices).toHaveLength(3);
      for (const link of staffServices) {
        expect(link.staffId).toBe(staffId);
        expect(services.map((s) => s.id)).toContain(link.serviceId);
      }

      const businessHours = await prisma.businessHour.findMany({
        where: { tenantId },
        orderBy: { dayOfWeek: "asc" },
      });
      expect(businessHours).toHaveLength(6);
      expect(businessHours.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6]);
      for (const row of businessHours) {
        expect(row.opensAt).toBe("09:00");
        expect(row.closesAt).toBe("18:00");
        expect(row.isClosed).toBe(false);
      }

      const blackouts = await prisma.blackout.findMany({ where: { tenantId } });
      expect(blackouts).toHaveLength(1);
      expect(blackouts[0].date).toBe("2026-12-25");
      expect(blackouts[0].reason).toBe("Christmas Day");

      const clients = await prisma.client.findMany({ where: { tenantId } });
      expect(clients).toHaveLength(1);
      expect(clients[0].name).toBe("Demo Client");
      expect(clients[0].email).toBe("client@demo.bukay.dev");
      expect(clients[0].phone).toBe("+2348000000099");

      const bookings = await prisma.booking.findMany({ where: { tenantId } });
      expect(bookings).toHaveLength(1);
      expect(bookings[0].status).toBe("confirmed");
      expect(bookings[0].clientId).toBe(clients[0].id);
      expect(bookings[0].staffId).toBe(staffId);
      const haircut = services.find((s) => s.name === "Classic Haircut");
      expect(bookings[0].serviceId).toBe(haircut!.id);
      // startsAt matches the seed-pinned wall clock; endsAt = startsAt + duration.
      const expectedStart = new Date("2026-06-15T10:00:00.000Z");
      const expectedEnd = new Date(expectedStart.getTime() + haircut!.durationMinutes * 60_000);
      expect(bookings[0].startsAt.toISOString()).toBe(expectedStart.toISOString());
      expect(bookings[0].endsAt.toISOString()).toBe(expectedEnd.toISOString());

      const payments = await prisma.payment.findMany({ where: { tenantId } });
      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe("paid");
      expect(payments[0].currency).toBe(tenant!.currency);
      expect(payments[0].amountCents).toBe(haircut!.priceCents);
      expect(payments[0].provider).toBe("mobile_money");
      expect(payments[0].providerRef).toBe("demo-mm-0001");
      expect(payments[0].bookingId).toBe(bookings[0].id);
      expect(payments[0].paidAt).not.toBeNull();
      expect(payments[0].paidAt!.toISOString()).toBe(expectedStart.toISOString());

      const auditLogs = await prisma.auditLog.findMany({ where: { tenantId } });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe("seed.bootstrap");
      expect(auditLogs[0].entityType).toBe("Tenant");
      expect(auditLogs[0].entityId).toBe(tenantId);
      expect(auditLogs[0].actorId).toBe(users[0].id);
      // Metadata is a JSON string; parse it and assert the seeded counts.
      expect(auditLogs[0].metadata).not.toBeNull();
      const meta = JSON.parse(auditLogs[0].metadata as string);
      expect(meta).toEqual({ services: 3, bookings: 1, payments: 1 });
    } finally {
      await prisma.$disconnect();
    }
  });
});
