/**
 * Structural tests for the `src/`-layout tenant context surface.
 *
 * Confirms that every module referenced by the acceptance criteria imports
 * cleanly and re-exports the symbols other code expects. If any of the
 * underlying modules move or a re-export gets stale, one of these imports
 * will fail at load time and the test will fail.
 */

import { describe, expect, it } from "vitest";

import {
  withTenantScope,
  runWithTenantContext,
  requireTenantContext,
  tenantContext,
  resolveTenant as resolveTenantFromMiddleware,
} from "@/src/middleware/tenantContext";
import { resolveTenant as resolveTenantFromLib } from "@/src/app/lib/resolve-tenant";
import { resolveTenant as resolveTenantFromTenancy } from "@/src/app/tenancy/resolve-tenant";

describe("src/middleware/tenantContext", () => {
  it("re-exports the tenant-scope wrapper and context helpers", () => {
    expect(withTenantScope).toBeTypeOf("function");
    expect(runWithTenantContext).toBeTypeOf("function");
    expect(requireTenantContext).toBeTypeOf("function");
    expect(tenantContext).toBeDefined();
  });

  it("shares the same tenant context instance as the canonical module", async () => {
    const canonical = await import("@/app/tenancy/tenant-context");
    expect(tenantContext).toBe(canonical.tenantContext);
  });

  it("uses the same resolveTenant implementation as app/lib", () => {
    expect(resolveTenantFromMiddleware).toBe(resolveTenantFromLib);
  });
});

describe("src/app/lib/resolve-tenant", () => {
  it("re-exports resolveTenant identical to the canonical module", async () => {
    const canonical = await import("@/app/lib/resolve-tenant");
    expect(resolveTenantFromLib).toBe(canonical.resolveTenant);
  });
});

describe("src/app/tenancy/resolve-tenant", () => {
  it("re-exports resolveTenant identical to the canonical module", async () => {
    const canonical = await import("@/app/tenancy/resolve-tenant");
    expect(resolveTenantFromTenancy).toBe(canonical.resolveTenant);
  });

  it("returns a session-source resolution when session.tenantId is set", () => {
    const result = resolveTenantFromTenancy({
      headers: { get: () => null } as unknown as Headers,
      session: { tenantId: "t-session" },
    });
    expect(result).toEqual({ source: "session", tenantId: "t-session" });
  });
});
