import type { NextRequest } from "next/server";

import type {
  ResolvedTenant,
  TenantLookup,
  TenantSession,
} from "./resolveTenant";
import { resolveTenant } from "./resolveTenant";
import { tenantContext } from "./tenantContext";

export async function withTenantContext<T>(
  req: NextRequest,
  lookup: TenantLookup,
  handler: (tenant: ResolvedTenant) => Promise<T> | T,
  session?: TenantSession | null
): Promise<T | null> {
  const tenant = await resolveTenant(req, lookup, session);
  if (!tenant) return null;

  return tenantContext.run(
    { tenantId: tenant.id, tenantSlug: tenant.slug },
    () => handler(tenant)
  );
}
