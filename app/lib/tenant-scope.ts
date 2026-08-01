import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type TenantScopeOptions = {
  required?: boolean;
};

export type RouteHandler<TArgs extends unknown[]> = (
  req: NextRequest,
  ...args: TArgs
) => Promise<Response> | Response;

export function withTenantScope<TArgs extends unknown[]>(
  handler: RouteHandler<TArgs>,
  options: TenantScopeOptions = {}
): (req: NextRequest, ...args: TArgs) => Promise<Response> {
  return async (req, ...args) => {
    const resolved = resolveTenant({ headers: req.headers });
    let tenantId: string | undefined;

    if (resolved.tenantId?.trim()) {
      tenantId = resolved.tenantId.trim();
    } else if (resolved.tenantSlug?.trim()) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: resolved.tenantSlug.trim() },
        select: { id: true },
      });

      if (!tenant) {
        return NextResponse.json({ ok: false, error: "tenant_not_found" }, { status: 404 });
      }

      tenantId = tenant.id;
    }

    if (!tenantId) {
      if (options.required) {
        return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
      }
      return handler(req, ...args);
    }

    return runWithTenantContext({ tenantId }, () => handler(req, ...args));
  };
}
