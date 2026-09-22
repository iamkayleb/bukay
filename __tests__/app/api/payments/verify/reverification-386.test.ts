/**
 * Re-verification contract for follow-up #387 / PR #386 CONCERNS.
 *
 * Structural assertions here are intentional contract guards: they lock the
 * reviewable shape of CI/lockfile wiring that behavioral route tests cannot see.
 * Behavioral coverage for payment verify critical paths lives in
 * route.test.ts and verify-flow.test.ts (confirm/fail, hold release, splits).
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("re-verification: PR #386 concerns", () => {
  it("pnpm-lock.yaml exists, is git-tracked, and is a pnpm lockfile", async () => {
    // Verifies the working tree lockfile that eval/cursor already carries
    // (confirmed offline against origin/eval/cursor — see VERIFICATION.md).
    const lockPath = path.join(process.cwd(), "pnpm-lock.yaml");
    const source = await fs.readFile(lockPath, "utf8");
    expect(source.startsWith("lockfileVersion:")).toBe(true);
    expect(source).toMatch(/lockfileVersion:\s*['"]?9/);

    const tracked = execFileSync("git", ["ls-files", "--error-unmatch", "pnpm-lock.yaml"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe("pnpm-lock.yaml");

    await expect(fs.access(path.join(process.cwd(), "package-lock.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("CI asserts pnpm-lock.yaml presence before install and tests", async () => {
    const ciPath = path.join(process.cwd(), ".github/workflows/ci.yml");
    const source = await fs.readFile(ciPath, "utf8");

    const assertIdx = source.indexOf("Assert pnpm lockfile");
    const installIdx = source.indexOf("pnpm install --frozen-lockfile");
    const testIdx = source.indexOf("run: pnpm test");

    expect(assertIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeGreaterThan(-1);
    expect(testIdx).toBeGreaterThan(-1);
    expect(assertIdx).toBeLessThan(installIdx);
    expect(assertIdx).toBeLessThan(testIdx);

    expect(source).toMatch(/\[ ! -f pnpm-lock\.yaml \]|test -f pnpm-lock\.yaml/);
    expect(source).toContain("pnpm-lock.yaml");
  });
});
