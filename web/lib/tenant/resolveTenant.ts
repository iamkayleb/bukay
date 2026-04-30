import type { NextRequest } from "next/server";

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
}

export type TenantLookup = (slug: string) => Promise<ResolvedTenant | null>;

export interface TenantSession {
  tenantSlug?: string;
}

/**
 * Extracts the subdomain slug from a Host header value.
 * Returns null for bare domains, "www", or localhost.
 */
export function extractSubdomainSlug(host: string): string | null {
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  if (parts.length >= 3 && parts[0] !== "www" && parts[0] !== "") {
    return parts[0];
  }
  return null;
}

/**
 * Resolves the tenant for an incoming request.
 * Resolution order:
 *   1. Subdomain (e.g. acme.example.com → slug "acme")
 *   2. Session tenantSlug (set after login for non-subdomain flows)
 *   3. tenantSlug cookie (fallback)
 */
export async function resolveTenant(
  req: NextRequest,
  lookup: TenantLookup,
  session?: TenantSession | null
): Promise<ResolvedTenant | null> {
  const host = req.headers.get("host") ?? "";
  const slug = extractSubdomainSlug(host);
  if (slug) {
    const tenant = await lookup(slug);
    if (tenant) return tenant;
  }

  const sessionSlug = session?.tenantSlug;
  if (sessionSlug) {
    const tenant = await lookup(sessionSlug);
    if (tenant) return tenant;
  }

  const cookieSlug = req.cookies.get("tenantSlug")?.value;
  if (cookieSlug) {
    return lookup(cookieSlug);
  }

  return null;
}
