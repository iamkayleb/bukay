/**
 * Functional test for `withTenantScope`.
 *
 * `tests/integration/routeHandlerWiring.test.ts` catches missing wrappers by
 * grepping source for wiring tokens. That's cheap but weak: a route that
 * *mentioned* `withTenantScope` in a comment would pass. This test proves
 * runtime behavior — a wrapped handler executes inside an
 * `AsyncLocalStorage` tenant context so `requireTenantContext()` succeeds
 * from within the handler body.
 *
 * This backs acceptance criterion #1 (tenant context established for each
 * request) with a real invocation, not a token match.
 */

import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { withTenantScope } from "@/app/lib/tenant-scope";
import { requireTenantContext } from "@/app/tenancy/tenant-context";

function requestWithTenantHeader(tenantId: string | null): NextRequest {
  const headers = new Headers();
  if (tenantId !== null) {
    headers.set("x-tenant-id", tenantId);
  }
  return new NextRequest("http://test.local/api/echo", { headers });
}

describe("withTenantScope — runtime tenant context wiring", () => {
  it("runs the wrapped handler inside a tenant context that requireTenantContext can read", async () => {
    let observedTenantId: string | undefined;
    const wrapped = withTenantScope(() => {
      observedTenantId = requireTenantContext().tenantId;
      return NextResponse.json({ ok: true });
    });

    const res = await wrapped(requestWithTenantHeader("tenant-abc"));
    expect(res.status).toBe(200);
    expect(observedTenantId).toBe("tenant-abc");
  });

  it("trims whitespace on the x-tenant-id header before establishing context", async () => {
    let observedTenantId: string | undefined;
    const wrapped = withTenantScope(() => {
      observedTenantId = requireTenantContext().tenantId;
      return NextResponse.json({ ok: true });
    });

    await wrapped(requestWithTenantHeader("  tenant-trimmed  "));
    expect(observedTenantId).toBe("tenant-trimmed");
  });

  it("runs the handler without a tenant context when the header is absent and required is false", async () => {
    let hadContext = true;
    const wrapped = withTenantScope(() => {
      try {
        requireTenantContext();
        hadContext = true;
      } catch {
        hadContext = false;
      }
      return NextResponse.json({ ok: true });
    });

    const res = await wrapped(requestWithTenantHeader(null));
    expect(res.status).toBe(200);
    expect(hadContext).toBe(false);
  });

  it("short-circuits with 400 tenant_required when required is true and no tenant is provided", async () => {
    const wrapped = withTenantScope(
      () => NextResponse.json({ ok: true }),
      { required: true }
    );

    const res = await wrapped(requestWithTenantHeader(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "tenant_required" });
  });

  it("propagates the tenant context across an awaited async boundary inside the handler", async () => {
    // AsyncLocalStorage should survive microtasks; regressions here mean the
    // wrapper is calling `.run(store, handler())` (invoking the handler
    // *outside* the store) instead of `.run(store, () => handler())`.
    let tenantIdAfterAwait: string | undefined;
    const wrapped = withTenantScope(async () => {
      await Promise.resolve();
      tenantIdAfterAwait = requireTenantContext().tenantId;
      return NextResponse.json({ ok: true });
    });

    await wrapped(requestWithTenantHeader("tenant-async"));
    expect(tenantIdAfterAwait).toBe("tenant-async");
  });
});
