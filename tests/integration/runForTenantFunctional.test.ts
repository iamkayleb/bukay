/**
 * Functional test for `runForTenant` — the wiring helper used by the
 * services and bookings API routes.
 *
 * `routeHandlerWiring.test.ts` proves those routes *mention* `runForTenant`
 * via a token match. That is cheap but weak: a route that referenced the
 * name in a comment would still pass. `withTenantScopeFunctional.test.ts`
 * closes the same gap for `withTenantScope`; this file closes it for the
 * second sanctioned wiring token so both routes into the tenant-context
 * store are proven to actually establish the AsyncLocalStorage store at
 * runtime.
 *
 * The Prisma slug lookup is mocked; the header path exercises the real
 * `resolveTenant` + `runWithTenantContext` chain.
 */

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: tenantFindUnique },
  },
}));

process.env.ROOT_HOST = "example.com";

import { runForTenant } from "@/app/api/services/_helpers";
import { requireTenantContext } from "@/app/tenancy/tenant-context";

function requestWithHeader(tenantId: string | null): NextRequest {
  const headers = new Headers();
  if (tenantId !== null) headers.set("x-tenant-id", tenantId);
  return new NextRequest("http://test.local/api/echo", { headers });
}

function requestWithSubdomain(subdomain: string): NextRequest {
  const headers = new Headers();
  headers.set("host", `${subdomain}.example.com`);
  return new NextRequest("http://test.local/api/echo", { headers });
}

describe("runForTenant — runtime tenant context wiring", () => {
  beforeEach(() => {
    tenantFindUnique.mockReset();
  });

  it("runs the callback inside a tenant context readable by requireTenantContext", async () => {
    let observedFromCallback: string | undefined;
    let observedFromContext: string | undefined;
    const result = await runForTenant(requestWithHeader("tenant-header"), async (tenantId) => {
      observedFromCallback = tenantId;
      observedFromContext = requireTenantContext().tenantId;
      return { ok: true, tenantId };
    });
    expect(observedFromCallback).toBe("tenant-header");
    expect(observedFromContext).toBe("tenant-header");
    expect(result).toEqual({ ok: true, tenantId: "tenant-header" });
  });

  it("returns 400 tenant_required and never runs the callback when no tenant is resolvable", async () => {
    const callback = vi.fn();
    const res = await runForTenant(requestWithHeader(null), callback);
    expect(callback).not.toHaveBeenCalled();
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(400);
    const body = await (res as NextResponse).json();
    expect(body).toEqual({ ok: false, error: "tenant_required" });
  });

  it("resolves a subdomain slug to a tenantId and runs the callback under that context", async () => {
    tenantFindUnique.mockResolvedValueOnce({ id: "tenant-from-slug" });
    let observed: string | undefined;
    const result = await runForTenant(requestWithSubdomain("acme"), async (tenantId) => {
      observed = requireTenantContext().tenantId;
      return { tenantId };
    });
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "acme" },
      select: { id: true },
    });
    expect(observed).toBe("tenant-from-slug");
    expect(result).toEqual({ tenantId: "tenant-from-slug" });
  });

  it("returns 404 tenant_not_found when the subdomain slug is not registered", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);
    const callback = vi.fn();
    const res = await runForTenant(requestWithSubdomain("ghost"), callback);
    expect(callback).not.toHaveBeenCalled();
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(404);
    const body = await (res as NextResponse).json();
    expect(body).toEqual({ ok: false, error: "tenant_not_found" });
  });

  it("keeps the tenant context alive across awaited async boundaries inside the callback", async () => {
    let tenantIdAfterAwait: string | undefined;
    await runForTenant(requestWithHeader("tenant-async"), async () => {
      await Promise.resolve();
      tenantIdAfterAwait = requireTenantContext().tenantId;
      return { ok: true };
    });
    expect(tenantIdAfterAwait).toBe("tenant-async");
  });
});
