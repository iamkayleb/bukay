/**
 * Middleware-side helper for establishing the AsyncLocalStorage tenant
 * context around a request pipeline stage.
 *
 * The heavy lifting — resolving a tenant from headers, sessions, or
 * subdomains and looking up its id — is delegated to `withTenantScope` in
 * `app/lib/tenant-scope.ts`. This module re-exports the primitives that
 * middleware and route wrappers rely on:
 *
 *   - `withTenantScope`      wrap a route handler in tenant context
 *   - `runWithTenantContext` execute an inner callback with a given
 *                            tenantId already resolved
 *   - `requireTenantContext` read the active tenant context (throws if
 *                            no context is on the stack)
 *   - `resolveTenant`        pure header/session/subdomain resolver
 */

export {
  withTenantScope,
  type TenantScopeOptions,
  type RouteHandler,
} from "@/app/lib/tenant-scope";
export {
  runWithTenantContext,
  requireTenantContext,
  tenantContext,
  type TenantContext,
} from "@/app/tenancy/tenant-context";
export { resolveTenant } from "@/app/lib/resolve-tenant";
