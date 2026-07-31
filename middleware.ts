/**
 * Next.js middleware — runs before every matching route handler.
 *
 * We use it to (a) surface the resolved tenant on the request headers so the
 * downstream handler can wire tenant context deterministically via
 * `withTenantScope` (see src/middleware/tenantContext.ts), and (b) refuse
 * requests that carry a client-supplied `x-tenant-id` header, which is not a
 * trusted boundary.
 *
 * See docs/MULTITENANCY.md for the full request-boundary contract.
 */
import { NextRequest, NextResponse } from "next/server";

import { resolveTenant } from "@/app/tenancy/resolve-tenant";

const UNTRUSTED_TENANT_HEADERS = ["x-tenant-id", "x-tenant"];

export function middleware(req: NextRequest) {
  for (const name of UNTRUSTED_TENANT_HEADERS) {
    if (req.headers.get(name)) {
      // Fail closed — a client cannot pin the tenant via headers.
      return NextResponse.json({ ok: false, error: "untrusted_tenant_header" }, { status: 400 });
    }
  }

  const resolved = resolveTenant({
    headers: req.headers,
    nextUrl: req.nextUrl,
    url: req.url,
  });

  const requestHeaders = new Headers(req.headers);
  if (resolved?.source === "session") {
    requestHeaders.set("x-resolved-tenant-id", resolved.tenantId);
  } else if (resolved?.source === "subdomain") {
    requestHeaders.set("x-resolved-tenant-slug", resolved.slug);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next|favicon.ico|login).*)"],
};
