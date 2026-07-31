/**
 * Re-export of the header/session/subdomain tenant resolver used by API
 * route helpers.
 *
 * The canonical implementation lives at `app/lib/resolve-tenant.ts`; this
 * thin re-export exposes the same API under the `src/` layout for
 * consumers that expect it there.
 */
export {
  type TenantSession,
  type ResolveTenantRequest,
  type ResolvedTenant,
  extractSubdomain,
  resolveTenant,
} from "@/app/lib/resolve-tenant";
