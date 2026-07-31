/**
 * Functional coverage for `withTenantScope`'s slug-resolution branch.
 *
 * The header-based path is covered by `withTenantScopeFunctional.test.ts`.
 * When the request carries no `x-tenant-id` header but the hostname implies a
 * tenant slug, the wrapper must look the slug up via `prisma.tenant.findUnique`
 * before establishing the AsyncLocalStorage context. This file mocks that
 * Prisma call so we can prove:
 *
 *   - a known slug resolves to a tenantId that `requireTenantContext()` reads
 *   - an unknown slug short-circuits with 404 `tenant_not_found` and never
 *     invokes the wrapped handler
 *
 * Backs acceptance criterion #1 for requests routed by subdomain rather than
 * by an explicit tenant header.
 */

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: { findUnique: tenantFindUnique },
  },
}));

// Force resolveTenant's subdomain extraction to succeed regardless of the
// hostname length by pinning ROOT_HOST before the module is imported.
process.env.ROOT_HOST = "example.com";

import { withTenantScope } from "@/app/lib/tenant-scope";
import { requireTenantContext } from "@/app/tenancy/tenant-context";

function requestFromSubdomain(subdomain: string | null): NextRequest {
  const headers = new Headers();
  if (subdomain !== null) {
    headers.set("host", `${subdomain}.example.com`);
  }
  return new NextRequest("http://test.local/api/echo", { headers });
}

describe("withTenantScope — slug-based tenant resolution", () => {
  beforeEach(() => {
    tenantFindUnique.mockReset();
  });

  it("resolves the slug to a tenantId and runs the handler inside that context", async () => {
    tenantFindUnique.mockResolvedValueOnce({ id: "tenant-from-slug" });

    let observedTenantId: string | undefined;
    const wrapped = withTenantScope(() => {
      observedTenantId = requireTenantContext().tenantId;
      return NextResponse.json({ ok: true });
    });

    const res = await wrapped(requestFromSubdomain("acme"));

    expect(res.status).toBe(200);
    expect(observedTenantId).toBe("tenant-from-slug");
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "acme" },
      select: { id: true },
    });
  });

  it("returns 404 tenant_not_found when the slug does not exist and never calls the handler", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);

    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const wrapped = withTenantScope(handler);

    const res = await wrapped(requestFromSubdomain("ghost"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "tenant_not_found" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("still short-circuits with 400 tenant_required when required=true and no header/slug is provided", async () => {
    tenantFindUnique.mockResolvedValueOnce(null);

    const handler = vi.fn(() => NextResponse.json({ ok: true }));
    const wrapped = withTenantScope(handler, { required: true });

    const res = await wrapped(requestFromSubdomain(null));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "tenant_required" });
    expect(handler).not.toHaveBeenCalled();
    // No slug means no Prisma lookup should be attempted.
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });
});
