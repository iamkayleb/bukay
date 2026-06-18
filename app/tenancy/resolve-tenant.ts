export interface TenantSession {
  tenantId?: string | null;
}

export interface TenantRequest {
  headers: Pick<Headers, "get">;
  session?: TenantSession | null;
  nextUrl?: {
    hostname: string;
  };
  url?: string;
}

export type TenantResolution =
  | {
      source: "session";
      tenantId: string;
    }
  | {
      source: "subdomain";
      slug: string;
    };

const RESERVED_SUBDOMAINS = new Set(["www"]);
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizedSessionTenantId(session: TenantSession | null | undefined): string | null {
  const tenantId = session?.tenantId?.trim();
  return tenantId || null;
}

function hostnameFromRequest(req: TenantRequest): string | null {
  if (req.nextUrl?.hostname) {
    return req.nextUrl.hostname;
  }

  if (req.url) {
    try {
      return new URL(req.url).hostname;
    } catch {
      // Fall back to the Host header for request-like objects used outside Next.js.
    }
  }

  const host = req.headers.get("host");
  if (!host) {
    return null;
  }

  return host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
}

function subdomainFromHostname(hostname: string | null): string | null {
  if (!hostname) {
    return null;
  }

  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  const isLocalhostSubdomain = labels.length === 2 && labels[1] === "localhost";
  const isIpAddress =
    hostname.includes(":") ||
    (labels.length === 4 &&
      labels.every((label) => /^\d{1,3}$/.test(label) && Number(label) <= 255));

  if (isIpAddress || (labels.length < 3 && !isLocalhostSubdomain)) {
    return null;
  }

  const subdomain = labels[0].trim();
  if (!DNS_LABEL.test(subdomain) || RESERVED_SUBDOMAINS.has(subdomain)) {
    return null;
  }

  return subdomain;
}

/**
 * Resolve the tenant selector carried by a request.
 *
 * Authenticated session state takes precedence over the hostname. A subdomain
 * resolves to a slug and must be looked up before it is used as a tenantId.
 */
export function resolveTenant(req: TenantRequest): TenantResolution | null {
  const tenantId = normalizedSessionTenantId(req.session);
  if (tenantId) {
    return { source: "session", tenantId };
  }

  const slug = subdomainFromHostname(hostnameFromRequest(req));
  return slug ? { source: "subdomain", slug } : null;
}
