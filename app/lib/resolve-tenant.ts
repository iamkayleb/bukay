export type TenantSession = {
  tenantId?: string;
  tenantSlug?: string;
};

export type ResolveTenantRequest = {
  headers: {
    get(name: string): string | null;
  };
  session?: TenantSession | null;
  /** When true, subdomain slug resolution is skipped (merchant-only callers). */
  requireSession?: boolean;
};

export type ResolvedTenant = {
  tenantId?: string;
  tenantSlug?: string;
  source: "session" | "subdomain" | "none";
};

const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "static", "assets", "cdn"]);

const ROOT_HOST = (process.env.ROOT_HOST ?? "").trim().toLowerCase();

export function extractSubdomain(host: string | null | undefined): string | undefined {
  if (!host) return undefined;
  const hostname = host.split(":")[0]?.trim().toLowerCase();
  if (!hostname) return undefined;

  let candidate: string | undefined;

  if (ROOT_HOST && hostname.endsWith(`.${ROOT_HOST}`)) {
    candidate = hostname.slice(0, -1 - ROOT_HOST.length);
  } else {
    const parts = hostname.split(".");
    if (parts.length < 3) return undefined;
    candidate = parts[0];
  }

  if (!candidate || RESERVED_SUBDOMAINS.has(candidate)) return undefined;
  return candidate;
}

export function resolveTenant(req: ResolveTenantRequest): ResolvedTenant {
  const sessionTenantId = req.session?.tenantId?.trim();
  if (sessionTenantId) {
    return {
      tenantId: sessionTenantId,
      tenantSlug: req.session?.tenantSlug,
      source: "session",
    };
  }

  if (req.requireSession) {
    return { source: "none" };
  }

  const slug = extractSubdomain(req.headers.get("host"));
  if (slug) {
    return { tenantSlug: slug, source: "subdomain" };
  }

  return { source: "none" };
}
