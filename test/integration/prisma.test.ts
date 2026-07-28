// Integration tests that exercise the Prisma CLI against a disposable SQLite
// database. Runs `prisma migrate dev` (non-interactive against a fresh DB
// with no schema drift — it applies committed migrations without prompting)
// with `--skip-seed --skip-generate` so this suite owns the seed step and
// doesn't regenerate the client mid-test, then runs `prisma db seed`, and
// verifies:
//   1. every migration in `prisma/migrations/` landed in `_prisma_migrations`,
//   2. every model the seed script touches has the expected rows.
//
// The suite is skipped automatically when the Prisma CLI + seed runner
// (ts-node/tsx) aren't installed (fresh checkout without `npm install`) so
// unrelated test runs stay green.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const ROOT = process.cwd();
const BIN_DIR = join(ROOT, "node_modules", ".bin");
const PRISMA_BIN = join(BIN_DIR, "prisma");
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");
const cliInstalled =
  existsSync(PRISMA_BIN) &&
  (existsSync(join(BIN_DIR, "ts-node")) || existsSync(join(BIN_DIR, "tsx")));
const suite = cliInstalled ? describe : describe.skip;

type RunResult = { status: number | null; stdout: string; stderr: string };

function runPrisma(args: string[], env: NodeJS.ProcessEnv): RunResult {
  // Prepend node_modules/.bin to PATH so `prisma db seed`'s child process
  // (which runs the package.json seed command) can resolve ts-node/tsx from
  // the project install rather than a global one.
  const augmentedPath = `${BIN_DIR}${delimiter}${process.env.PATH ?? ""}`;
  const result = spawnSync(PRISMA_BIN, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: augmentedPath,
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
      ...env,
    },
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function committedMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .filter((name) => existsSync(join(MIGRATIONS_DIR, name, "migration.sql")))
    .sort();
}

suite("prisma migrate + db seed (integration)", () => {
  let tempDir: string;
  let databaseUrl: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "bukay-prisma-"));
    databaseUrl = `file:${join(tempDir, "test.db")}`;
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("applies every committed migration and records them in _prisma_migrations", async () => {
    const result = runPrisma(["migrate", "dev", "--skip-seed", "--skip-generate"], { DATABASE_URL: databaseUrl });
    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).toBe(0);
    expect(result.stderr).not.toMatch(/error/i);
    expect(existsSync(join(tempDir, "test.db"))).toBe(true);

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT migration_name FROM _prisma_migrations ORDER BY migration_name ASC`
      );
      const applied = rows.map((r) => r.migration_name).sort();
      const expected = committedMigrationNames();
      expect(expected.length).toBeGreaterThan(0);
      expect(applied).toEqual(expected);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("seeds the demo tenant with every associated model populated", async () => {
    const migrate = runPrisma(["migrate", "dev", "--skip-seed", "--skip-generate"], { DATABASE_URL: databaseUrl });
    expect(migrate.status, `migrate stderr: ${migrate.stderr}`).toBe(0);

    const seed = runPrisma(["db", "seed"], { DATABASE_URL: databaseUrl });
    expect(seed.status, `seed stderr: ${seed.stderr}\nseed stdout: ${seed.stdout}`).toBe(0);

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
      expect(tenant).not.toBeNull();
      expect(tenant?.name).toMatch(/demo/i);
      const tenantId = tenant!.id;

      const users = await prisma.user.findMany({ where: { tenantId } });
      expect(users.length).toBe(1);
      expect(users[0].email).toBe("owner@demo.bukay.dev");
      expect(users[0].role).toBe("owner");

      const services = await prisma.service.findMany({ where: { tenantId } });
      expect(services.length).toBe(3);
      expect(services.map((s) => s.name).sort()).toEqual(
        ["Beard Trim", "Classic Haircut", "Full Grooming Package"].sort()
      );

      const staff = await prisma.staff.findMany({ where: { tenantId } });
      expect(staff.length).toBe(1);
      expect(staff[0].email).toBe("owner@demo.bukay.dev");

      const staffServices = await prisma.staffService.findMany({ where: { tenantId } });
      expect(staffServices.length).toBe(services.length);
      const serviceIds = new Set(services.map((s) => s.id));
      for (const link of staffServices) {
        expect(link.staffId).toBe(staff[0].id);
        expect(serviceIds.has(link.serviceId)).toBe(true);
      }

      const businessHours = await prisma.businessHour.findMany({ where: { tenantId } });
      expect(businessHours.length).toBe(6);
      expect(businessHours.every((h) => h.opensAt === "09:00" && h.closesAt === "18:00")).toBe(
        true
      );
      expect(businessHours.map((h) => h.dayOfWeek).sort()).toEqual([1, 2, 3, 4, 5, 6]);

      const blackouts = await prisma.blackout.findMany({ where: { tenantId } });
      expect(blackouts.length).toBe(1);
      expect(blackouts[0].date).toBe("2026-12-25");
      expect(blackouts[0].reason).toBe("Christmas Day");

      const clients = await prisma.client.findMany({ where: { tenantId } });
      expect(clients.length).toBe(1);
      expect(clients[0].phone).toBe("+2348000000099");
      expect(clients[0].email).toBe("client@demo.bukay.dev");

      const haircut = services.find((s) => s.name === "Classic Haircut");
      expect(haircut).toBeTruthy();

      const bookings = await prisma.booking.findMany({ where: { tenantId } });
      expect(bookings.length).toBe(1);
      expect(bookings[0].status).toBe("confirmed");
      expect(bookings[0].clientId).toBe(clients[0].id);
      expect(bookings[0].serviceId).toBe(haircut!.id);
      expect(bookings[0].staffId).toBe(staff[0].id);

      const payments = await prisma.payment.findMany({ where: { tenantId } });
      expect(payments.length).toBe(1);
      expect(payments[0].bookingId).toBe(bookings[0].id);
      expect(payments[0].status).toBe("paid");
      expect(payments[0].provider).toBe("mobile_money");
      expect(payments[0].providerRef).toBe("demo-mm-0001");
      expect(payments[0].amountCents).toBe(haircut!.priceCents);
      expect(payments[0].currency).toBe(tenant!.currency);

      const auditLogs = await prisma.auditLog.findMany({ where: { tenantId } });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(auditLogs.some((l) => l.action === "seed.bootstrap")).toBe(true);
      const bootstrapLog = auditLogs.find((l) => l.action === "seed.bootstrap");
      expect(bootstrapLog?.entityType).toBe("Tenant");
      expect(bootstrapLog?.entityId).toBe(tenantId);
    } finally {
      await prisma.$disconnect();
    }
  });
});
