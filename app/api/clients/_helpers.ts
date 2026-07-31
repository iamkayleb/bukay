import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/app/db/prisma";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type TagRecord = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type ClientTagRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  tagId: string;
  tag: TagRecord;
  createdAt: Date | string;
};

export type ClientRecord = {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string;
  notes: string | null;
  tags: ClientTagRecord[];
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

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeTag(tag: TagRecord) {
  return {
    id: tag.id,
    tenantId: tag.tenantId,
    name: tag.name,
    createdAt: iso(tag.createdAt),
    updatedAt: iso(tag.updatedAt),
  };
}

export function serializeClient(client: ClientRecord) {
  return {
    id: client.id,
    tenantId: client.tenantId,
    name: client.name,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    tags: client.tags
      .map((clientTag) => serializeTag(clientTag.tag))
      .sort((left, right) => left.name.localeCompare(right.name)),
    createdAt: iso(client.createdAt),
    updatedAt: iso(client.updatedAt),
  };
}

export function isUniqueConstraintError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
