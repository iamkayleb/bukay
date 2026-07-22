import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
};

const clientDelegate = prisma.client as unknown as {
  findMany(args: unknown): Promise<ClientRow[]>;
};

const MAX_RESULTS = 20;

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function serialize(client: ClientRow) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
  };
}

async function runForTenant<T>(
  req: NextRequest,
  callback: (tenantId: string) => Promise<T>,
): Promise<T | NextResponse> {
  const resolved = resolveTenant({ headers: req.headers });

  if (resolved.tenantId?.trim()) {
    const tenantId = resolved.tenantId.trim();
    return runWithTenantContext({ tenantId }, () => callback(tenantId));
  }

  if (resolved.tenantSlug?.trim()) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });

    if (!tenant) {
      return jsonError("tenant_not_found", 404);
    }

    return runWithTenantContext({ tenantId: tenant.id }, () => callback(tenant.id));
  }

  return jsonError("tenant_required", 400);
}

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();

  return runForTenant(req, async (tenantId) => {
    const where: Record<string, unknown> = { tenantId };
    if (query.length > 0) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
      ];
    }

    const clients = await clientDelegate.findMany({
      where,
      orderBy: [{ name: "asc" }],
      take: MAX_RESULTS,
    });

    return NextResponse.json({
      ok: true,
      clients: clients.map(serialize),
    });
  });
}
