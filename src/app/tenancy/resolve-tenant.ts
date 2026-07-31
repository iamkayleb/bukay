/**
 * Re-export of the tenant resolver used by API middleware.
 *
 * The canonical implementation lives at `app/tenancy/resolve-tenant.ts`;
 * this thin re-export keeps `src/app/tenancy/resolve-tenant.ts` as a
 * documented, importable path for downstream consumers that expect the
 * `src/` layout.
 */
export {
  type TenantSession,
  type TenantRequest,
  type TenantResolution,
  resolveTenant,
} from "@/app/tenancy/resolve-tenant";
