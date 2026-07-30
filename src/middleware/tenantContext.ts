/**
 * Request-boundary middleware that resolves the tenant for an incoming request
 * and installs it into the AsyncLocalStorage-backed tenant context.
 *
 * Every tenant-scoped Next.js route handler should route through
 * `withTenantScope(req, ...)` before touching the Prisma client. The helper:
 *   1. resolves the tenant (session preferred, subdomain fallback);
 *   2. rejects requests that fail to resolve a tenant with a 400;
 *   3. runs the handler inside `runWithTenantContext` so the tenant guard on
 *      the Prisma client can enforce isolation.
 *
 * IMPORTANT: this helper deliberately does NOT read a tenantId from a
 * client-supplied header. See docs/MULTITENANCY.md for the rationale.
 */
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/tenancy/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type TenantResolvedHandler<T> = (tenantId: string) => Promise<T>;

/**
 * Resolve the tenant carried by a request and run `handler` inside its
 * async context. When the tenant cannot be resolved, returns a 400 response
 * so callers do not have to handle it themselves.
 */
export async function withTenantScope<T>(
  req: NextRequest,
  handler: TenantResolvedHandler<T>
): Promise<T | NextResponse> {
  const resolved = resolveTenant({
    headers: req.headers,
    nextUrl: req.nextUrl,
    url: req.url,
  });

  if (!resolved) {
    return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  }

  if (resolved.source === "session") {
    const tenantId = resolved.tenantId.trim();
    return runWithTenantContext({ tenantId }, () => handler(tenantId));
  }

  const slug = resolved.slug.trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!tenant) {
    return NextResponse.json({ ok: false, error: "tenant_not_found" }, { status: 404 });
  }

  return runWithTenantContext({ tenantId: tenant.id }, () => handler(tenant.id));
}
