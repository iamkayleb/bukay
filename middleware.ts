import { NextRequest, NextResponse } from "next/server";

import { extractSubdomain, PUBLIC_TENANT_SLUG_HEADER } from "@/app/lib/resolve-tenant";

export function middleware(request: NextRequest) {
  const tenantSlug = extractSubdomain(request.headers.get("host"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(PUBLIC_TENANT_SLUG_HEADER);

  if (!tenantSlug && !request.headers.has(PUBLIC_TENANT_SLUG_HEADER)) {
    return NextResponse.next();
  }

  if (tenantSlug) {
    requestHeaders.set(PUBLIC_TENANT_SLUG_HEADER, tenantSlug);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
