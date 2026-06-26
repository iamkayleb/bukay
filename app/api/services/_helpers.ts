import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type ServiceRecord = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function validationError(error: ZodError) {
  const flattened = error.flatten();
  return NextResponse.json(
    {
      ok: false,
      error: "validation_failed",
      fieldErrors: flattened.fieldErrors,
      formErrors: flattened.formErrors,
    },
    { status: 422 },
  );
}

export async function readJson(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
}

export async function runForTenant<T>(
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

export function serializeService(service: ServiceRecord) {
  return {
    id: service.id,
    tenantId: service.tenantId,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceKobo: service.priceKobo,
    bufferMinutes: service.bufferMinutes,
    active: service.active,
    createdAt:
      service.createdAt instanceof Date ? service.createdAt.toISOString() : service.createdAt,
    updatedAt:
      service.updatedAt instanceof Date ? service.updatedAt.toISOString() : service.updatedAt,
  };
}

export function isMissingRecordError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

export function isUniqueConstraintError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
