import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { updateSettingsSchema } from "@/app/lib/settings/schemas";
import {
  isUniqueConstraintError,
  jsonError,
  readJson,
  runForTenant,
  validationError,
} from "@/app/api/services/_helpers";

export const dynamic = "force-dynamic";

type TenantSettingsRecord = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  brandColor: string;
  logoUrl: string | null;
  cancellationPolicy: string | null;
  updatedAt: Date | string;
};

const settingsSelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  currency: true,
  brandColor: true,
  logoUrl: true,
  cancellationPolicy: true,
  updatedAt: true,
};

const tenantDelegate = prisma.tenant as unknown as {
  findUnique(args: unknown): Promise<TenantSettingsRecord | null>;
  update(args: unknown): Promise<TenantSettingsRecord>;
};

function serializeSettings(settings: TenantSettingsRecord) {
  return {
    id: settings.id,
    name: settings.name,
    slug: settings.slug,
    timezone: settings.timezone,
    currency: settings.currency,
    brandColor: settings.brandColor,
    logoUrl: settings.logoUrl,
    cancellationPolicy: settings.cancellationPolicy,
    publicUrl: `https://${settings.slug}.bukay.app`,
    updatedAt:
      settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const settings = await tenantDelegate.findUnique({
      where: { id: tenantId },
      select: settingsSelect,
    });

    if (!settings) {
      return jsonError("tenant_not_found", 404);
    }

    return NextResponse.json({ ok: true, settings: serializeSettings(settings) });
  });
}

export async function PATCH(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const settings = await tenantDelegate.update({
        where: { id: tenantId },
        data: parsed.data,
        select: settingsSelect,
      });

      return NextResponse.json({ ok: true, settings: serializeSettings(settings) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError("tenant_slug_conflict", 409);
      }

      throw error;
    }
  });
}
