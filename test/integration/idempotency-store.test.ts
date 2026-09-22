import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

import {
  claimIdempotencyKey,
  createPrismaIdempotencyStore,
  IDEMPOTENCY_TTL_MS,
} from "@/app/lib/idempotency";

// Unit tests for the idempotency store (see idempotency.test.ts) mock the
// Prisma client entirely, so they can't tell a genuinely durable store apart
// from one that just happens to keep its mock state around for the test
// process's lifetime. This suite instead points the *real* generated Prisma
// Client at a throwaway, migrated-from-scratch SQLite file, so persistence is
// verified against actual disk state rather than an in-memory double.
const prismaBinary = join(process.cwd(), "node_modules", ".bin", "prisma");
const suite = existsSync(prismaBinary) ? describe : describe.skip;

let tempDir: string;
let dbPath: string;
let client: PrismaClient;

suite("idempotency store against a real, migrated SQLite database", () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "bukay-idempotency-"));
    dbPath = join(tempDir, "test.db");

    cpSync(join(process.cwd(), "prisma", "migrations"), join(tempDir, "migrations"), {
      recursive: true,
    });

    const schemaSrc = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const schemaForTest = schemaSrc.replace(/url\s*=\s*"file:[^"]*"/, `url = "file:${dbPath}"`);
    writeFileSync(join(tempDir, "schema.prisma"), schemaForTest);

    execFileSync(prismaBinary, ["migrate", "deploy", "--schema", join(tempDir, "schema.prisma")], {
      stdio: "pipe",
    });

    client = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  }, 60_000);

  afterAll(async () => {
    await client?.$disconnect();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("persists a claimed key so a fresh connection to the same file sees it as already claimed", async () => {
    const store = createPrismaIdempotencyStore(client);
    const key = "integration-evt-restart";

    expect(await claimIdempotencyKey(key, Date.now(), store)).toBe(true);

    // A brand-new PrismaClient pointed at the same on-disk file stands in for
    // a fresh process picking the database back up after a restart — no
    // module-level state is shared with the client/store above.
    const restartedClient = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
    try {
      const restartedStore = createPrismaIdempotencyStore(restartedClient);
      expect(await claimIdempotencyKey(key, Date.now(), restartedStore)).toBe(false);
    } finally {
      await restartedClient.$disconnect();
    }
  });

  it("reclaims an expired key once its TTL has passed, against real persisted rows", async () => {
    const store = createPrismaIdempotencyStore(client);
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const key = "integration-evt-ttl";

    expect(await claimIdempotencyKey(key, start, store)).toBe(true);
    expect(await claimIdempotencyKey(key, start + IDEMPOTENCY_TTL_MS - 1, store)).toBe(false);
    expect(await claimIdempotencyKey(key, start + IDEMPOTENCY_TTL_MS + 1, store)).toBe(true);
  });

  it("only lets one of two concurrent claims for the same key win against the real database", async () => {
    const store = createPrismaIdempotencyStore(client);

    const [first, second] = await Promise.all([
      claimIdempotencyKey("integration-evt-concurrent", Date.now(), store),
      claimIdempotencyKey("integration-evt-concurrent", Date.now(), store),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
