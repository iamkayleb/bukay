/**
 * Structural guard that every Next.js API route handler under `app/api/`
 * (and any thin re-export shim under `src/routes/` or `src/api/`) invokes
 * tenant context wiring — either directly via `withTenantScope` or
 * transitively via the `runForTenant` helper, which itself calls
 * `runWithTenantContext`.
 *
 * This test exists to satisfy the PR's first acceptance criterion and to
 * prevent regressions: a new route added without a tenant-scoped wrapper
 * would silently issue Prisma queries outside any tenant context and
 * bypass the tenant-guard extension.
 *
 * A route file counts as compliant when its source text contains one of
 * the sanctioned wiring tokens OR it is a pure re-export of a handler
 * defined in another module that itself passes the same check.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const HANDLER_DIRS = [
  path.join(REPO_ROOT, "app", "api"),
  path.join(REPO_ROOT, "src", "routes"),
  path.join(REPO_ROOT, "src", "api"),
];

const WIRING_TOKENS = ["withTenantScope", "runForTenant", "runWithTenantContext"];

const HANDLER_METHOD_RE =
  /export\s+(?:async\s+)?(?:const|function)\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b/g;

const REEXPORT_RE =
  /export\s*\{[^}]*(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)[^}]*\}\s*from\s*["']([^"']+)["']/g;

function listRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry === "route.ts" || entry === "route.tsx") {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

function resolveReexportTarget(fromFile: string, spec: string): string | null {
  // Support both relative specifiers ("../foo") and the "@/…" alias that
  // maps to the repository root (see vitest.config.ts / tsconfig.json).
  let base: string;
  if (spec.startsWith("@/")) {
    base = path.join(REPO_ROOT, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function fileUsesTenantWiring(file: string, seen: Set<string> = new Set()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  if (WIRING_TOKENS.some((token) => source.includes(token))) {
    return true;
  }
  // Follow through re-export shims like:
  //   export { PATCH } from "@/api/bookings";
  const targets = new Set<string>();
  for (const match of source.matchAll(REEXPORT_RE)) {
    const spec = match[2];
    const resolved = resolveReexportTarget(file, spec);
    if (resolved) targets.add(resolved);
  }
  for (const target of targets) {
    if (fileUsesTenantWiring(target, seen)) return true;
  }
  return false;
}

function extractHandlerMethods(source: string): string[] {
  const methods: string[] = [];
  for (const match of source.matchAll(HANDLER_METHOD_RE)) {
    methods.push(match[1]);
  }
  for (const match of source.matchAll(REEXPORT_RE)) {
    methods.push(match[1]);
  }
  return methods;
}

describe("app/api & src/{routes,api} route handlers", () => {
  const routeFiles = HANDLER_DIRS.flatMap(listRouteFiles);

  it("finds at least one route file to audit", () => {
    // If this ever hits zero, the test is passing vacuously and we've
    // silently lost coverage — fail loudly instead.
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles.map((f) => [path.relative(REPO_ROOT, f), f]))(
    "%s exports HTTP handlers and wires tenant context",
    (_relative, file) => {
      const source = readFileSync(file, "utf8");
      const methods = extractHandlerMethods(source);
      expect(
        methods.length,
        `no HTTP handler exports found in ${file}`
      ).toBeGreaterThan(0);
      expect(
        fileUsesTenantWiring(file),
        `route ${file} does not call withTenantScope / runForTenant / runWithTenantContext`
      ).toBe(true);
    }
  );
});
