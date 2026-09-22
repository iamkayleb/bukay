/**
 * Re-verification contract for follow-up #382 / PR #363 CONCERNS.
 * Each case maps to a verification concern; keep this green before marking
 * "Re-verification passes".
 *
 * Trade-off — structural vs behavioral testing:
 * These checks intentionally use structural/textual assertions (file presence,
 * source length, string contains) as contract guards for reviewability and CI
 * wiring that unit tests of payment status transitions would miss. They are
 * brittle by design: a rename or refactor that changes shape should fail here.
 * Behavioral coverage of confirm/fail/hold-release paths is owned by
 * verify-flow.test.ts (and the thin surface checks in route.test.ts). Prefer
 * extending verify-flow for new payment behaviors; extend this file only when
 * locking a verifier concern about shape, lockfiles, or migrations.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as verifyRoute from "@/app/api/payments/verify/route";
import { SLOT_HOLD_TTL_MS } from "@/app/lib/slot-hold";

describe("re-verification: PR #363 concerns", () => {
  it("verify route stays thin so LLM evaluation can run on the adapter", async () => {
    // Structural contract guard (not a behavioral status-transition test).
    const routePath = path.join(process.cwd(), "app/api/payments/verify/route.ts");
    const source = await fs.readFile(routePath, "utf8");
    expect(source.length).toBeLessThan(1200);
    expect(source).toContain('from "@/app/lib/payments/verify-callback"');
    expect(Object.keys(verifyRoute).sort()).toEqual(["GET", "dynamic"].sort());
  });

  it("uses pnpm-lock.yaml for reproducible installs (no package-lock.json)", async () => {
    const root = process.cwd();
    await expect(fs.access(path.join(root, "pnpm-lock.yaml"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(root, "package-lock.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as {
      packageManager?: string;
    };
    expect(pkg.packageManager).toMatch(/^pnpm@/);
  });

  it("CI workflow installs with pnpm frozen lockfile", async () => {
    const ciPath = path.join(process.cwd(), ".github/workflows/ci.yml");
    const source = await fs.readFile(ciPath, "utf8");
    expect(source).toContain("pnpm install --frozen-lockfile");
    expect(source).toContain("Assert pnpm lockfile");
    expect(source).toContain("pnpm-lock.yaml");
    expect(source).toMatch(/\[ ! -f pnpm-lock\.yaml \]|test -f pnpm-lock\.yaml/);
    expect(source).not.toMatch(/npm ci\b/);
  });

  it("documents the 10-minute slot release window", () => {
    expect(SLOT_HOLD_TTL_MS).toBe(10 * 60 * 1000);
  });

  it("verify-callback owns payment status transitions (reviewable lib module)", async () => {
    const libPath = path.join(process.cwd(), "app/lib/payments/verify-callback.ts");
    const source = await fs.readFile(libPath, "utf8");
    expect(source).toContain("handlePaymentVerify");
    expect(source).toContain('status: "confirmed"');
    expect(source).toContain('status: "failed"');
    expect(source).toContain("releaseHoldForBooking");
    expect(source).toContain("platformSplitPercentage");
    expect(source).toContain("tenantId");
  });

  it("DeadLetter and IdempotencyKey migrations stay aligned with schema tests", async () => {
    const schema = await fs.readFile(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model DeadLetter");
    expect(schema).toContain("model IdempotencyKey");

    const deadLetterMigration = await fs.readFile(
      path.join(process.cwd(), "prisma/migrations/20260916120000_dead_letter/migration.sql"),
      "utf8"
    );
    expect(deadLetterMigration).toContain('CREATE TABLE "DeadLetter"');

    const idempotencyMigration = await fs.readFile(
      path.join(process.cwd(), "prisma/migrations/20260921194500_idempotency_key/migration.sql"),
      "utf8"
    );
    expect(idempotencyMigration).toContain('CREATE TABLE "IdempotencyKey"');

    const schemaTest = await fs.readFile(
      path.join(process.cwd(), "tests/test_prisma_schema.py"),
      "utf8"
    );
    const migrationTest = await fs.readFile(
      path.join(process.cwd(), "tests/test_prisma_migration.py"),
      "utf8"
    );
    expect(schemaTest).toContain("DeadLetter");
    expect(schemaTest).toContain("IdempotencyKey");
    expect(migrationTest).toContain("DeadLetter");
    expect(migrationTest).toContain("IdempotencyKey");
  });

  it("this follow-up PR stays scoped to payments verify (not ledger_validate)", async () => {
    // Historical PR #363 also landed scripts/ledger_validate.py; that script is
    // owned by its own merge path now. The verify follow-up must not re-bundle it.
    const libPath = path.join(process.cwd(), "app/lib/payments/verify-callback.ts");
    const source = await fs.readFile(libPath, "utf8");
    expect(source).not.toContain("ledger_validate");
    await expect(
      fs.access(path.join(process.cwd(), "scripts/ledger_validate.py"))
    ).resolves.toBeUndefined();
  });
});
