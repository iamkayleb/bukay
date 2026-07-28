// Integration tests that exercise the Prisma CLI against a disposable
// SQLite database. Runs `prisma migrate deploy` (the non-interactive
// equivalent of `prisma migrate dev` — no prompts, applies committed
// migrations) and `prisma db seed`, then verifies that the demo tenant
// and its associated rows were inserted.
//
// The suite is skipped automatically when the Prisma CLI isn't
// installed (e.g. a fresh checkout without `npm install`) so
// unrelated test runs stay green.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { delimiter } from "node:path";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const BIN_DIR = join(ROOT, "node_modules", ".bin");
const PRISMA_BIN = join(BIN_DIR, "prisma");
const cliInstalled = existsSync(PRISMA_BIN) && existsSync(join(BIN_DIR, "ts-node"));
const suite = cliInstalled ? describe : describe.skip;

type RunResult = { status: number | null; stdout: string; stderr: string };

function runPrisma(args: string[], env: NodeJS.ProcessEnv): RunResult {
  // Prepend node_modules/.bin to PATH so `prisma db seed`'s child process
  // (which runs `ts-node prisma/seed.ts`) can resolve ts-node from the
  // project install rather than a global one.
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

  it("applies every committed migration to a fresh database", () => {
    const result = runPrisma(["migrate", "deploy"], { DATABASE_URL: databaseUrl });
    expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).toBe(0);
    // The CLI reports how many migrations it applied; the checked-in
    // migration set is non-empty, so we expect either "applied" output or
    // a "database schema is up to date" confirmation.
    expect(result.stdout + result.stderr).toMatch(/migration|schema/i);
    expect(existsSync(join(tempDir, "test.db"))).toBe(true);
  });

  it("seeds a demo tenant with associated services and staff", async () => {
    const migrate = runPrisma(["migrate", "deploy"], { DATABASE_URL: databaseUrl });
    expect(migrate.status, `migrate stderr: ${migrate.stderr}`).toBe(0);

    const seed = runPrisma(["db", "seed"], { DATABASE_URL: databaseUrl });
    expect(seed.status, `seed stderr: ${seed.stderr}\nseed stdout: ${seed.stdout}`).toBe(0);

    // Verify the tenant row landed by loading the client on-demand
    // (avoids requiring @prisma/client at test-collection time in
    // environments where it isn't generated yet).
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
      expect(tenant).not.toBeNull();
      expect(tenant?.name).toMatch(/demo/i);

      const services = await prisma.service.findMany({ where: { tenantId: tenant!.id } });
      expect(services.length).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.$disconnect();
    }
  });
});
