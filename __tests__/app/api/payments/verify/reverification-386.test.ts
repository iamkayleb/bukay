/**
 * Re-verification contract for follow-up #387 / PR #386 CONCERNS.
 *
 * Trade-off — structural vs behavioral testing:
 * These checks intentionally use structural/textual assertions (git object
 * presence, CI step order, lockfileVersion) as contract guards for wiring that
 * payment status-transition tests cannot see. They are brittle by design: a
 * rename that drops the lockfile assert or a base branch without pnpm-lock.yaml
 * should fail here. Behavioral coverage of confirm/fail/hold-release paths is
 * owned by verify-flow.test.ts (mapped from route.test.ts). Prefer extending
 * verify-flow for new payment behaviors; extend this file only when locking a
 * verifier concern about lockfiles or CI shape.
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function assertBaseBranchLockfile(): string {
  const refs = ["origin/eval/cursor", "eval/cursor"];
  for (const ref of refs) {
    try {
      execFileSync("git", ["cat-file", "-e", `${ref}:pnpm-lock.yaml`], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
      return ref;
    } catch {
      // try next ref / fetch
    }
  }

  execFileSync("git", ["fetch", "--depth=1", "origin", "eval/cursor"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  execFileSync("git", ["cat-file", "-e", "origin/eval/cursor:pnpm-lock.yaml"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  return "origin/eval/cursor";
}

describe("re-verification: PR #386 concerns", () => {
  it("pnpm-lock.yaml exists on base branch eval/cursor", () => {
    // Contract guard: PR #386 deleted package-lock.json and relied on the
    // lockfile already present on eval/cursor — assert that base object exists.
    const ref = assertBaseBranchLockfile();
    const blob = execFileSync("git", ["rev-parse", `${ref}:pnpm-lock.yaml`], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    expect(blob).toMatch(/^[0-9a-f]{40}$/);
  });

  it("pnpm-lock.yaml exists, is git-tracked, and is a pnpm lockfile", async () => {
    // Working-tree companion to the base-branch object check above.
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
