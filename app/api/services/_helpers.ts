import { sessionFromCookies } from "@/app/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type ServiceRecord = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
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
    { status: 422 }
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
  callback: (tenantId: string) => Promise<T>
): Promise<T | NextResponse> {
  const session = sessionFromCookies(req.headers.get("cookie"));
  const tenantId = session?.tenantId?.trim();

  if (!session || !tenantId) {
    return jsonError("unauthorized", 401);
  }

  const headerTenantId = req.headers.get("x-tenant-id")?.trim();
  if (headerTenantId && headerTenantId !== tenantId) {
    return jsonError("tenant_forbidden", 403);
  }

  return runWithTenantContext({ tenantId }, () => callback(tenantId));
}

export function serializeService(service: ServiceRecord) {
  return {
    id: service.id,
    tenantId: service.tenantId,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceKobo: service.priceCents,
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

// Shared wire-to-storage mapping for both writes.
export function serviceWriteData<T extends { priceKobo: number }>(
  input: T
): Omit<T, "priceKobo"> & { priceCents: number };
export function serviceWriteData<T extends { priceKobo?: number }>(
  input: T
): Omit<T, "priceKobo"> & { priceCents?: number };
export function serviceWriteData<T extends { priceKobo?: number }>(input: T) {
  const { priceKobo, ...fields } = input;
  return { ...fields, ...(priceKobo === undefined ? {} : { priceCents: priceKobo }) };
}
