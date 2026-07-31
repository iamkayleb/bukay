import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { settingsSchema, slugAvailabilitySchema } from "@/app/lib/settings/schemas";
import {
  isMissingRecordError,
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
  logoUrl: string | null;
  brandColor: string;
  cancellationPolicy: string;
  updatedAt: Date | string;
};

type TenantSlugRecord = {
  id: string;
  slug: string;
};

const tenantSettingsSelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  currency: true,
  logoUrl: true,
  brandColor: true,
  cancellationPolicy: true,
  updatedAt: true,
};

const tenantDelegate = prisma.tenant as unknown as {
  findUnique(args: unknown): Promise<TenantSettingsRecord | null>;
  update(args: unknown): Promise<TenantSettingsRecord>;
};

const tenantSlugDelegate = prisma.tenant as unknown as {
  findUnique(args: unknown): Promise<TenantSlugRecord | null>;
};

function serializeSettings(settings: TenantSettingsRecord) {
  return {
    id: settings.id,
    name: settings.name,
    slug: settings.slug,
    timezone: settings.timezone,
    currency: settings.currency,
    logoUrl: settings.logoUrl,
    brandColor: settings.brandColor,
    cancellationPolicy: settings.cancellationPolicy,
    updatedAt:
      settings.updatedAt instanceof Date ? settings.updatedAt.toISOString() : settings.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  const requestedSlug = req.nextUrl.searchParams.get("slug");

  if (requestedSlug !== null) {
    const parsed = slugAvailabilitySchema.safeParse({ slug: requestedSlug });
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    return runForTenant(req, async (tenantId) => {
      const existingTenant = await tenantSlugDelegate.findUnique({
        where: { slug: parsed.data.slug },
        select: { id: true, slug: true },
      });

      return NextResponse.json({
        ok: true,
        slug: parsed.data.slug,
        available: !existingTenant || existingTenant.id === tenantId,
      });
    });
  }

  return runForTenant(req, async (tenantId) => {
    const settings = await tenantDelegate.findUnique({
      where: { id: tenantId },
      select: tenantSettingsSelect,
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

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    const existingTenant = await tenantSlugDelegate.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true, slug: true },
    });

    if (existingTenant && existingTenant.id !== tenantId) {
      return jsonError("slug_unavailable", 409);
    }

    try {
      const settings = await tenantDelegate.update({
        where: { id: tenantId },
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          timezone: parsed.data.timezone,
          currency: parsed.data.currency,
          logoUrl: parsed.data.logoUrl || null,
          brandColor: parsed.data.brandColor.toLowerCase(),
          cancellationPolicy: parsed.data.cancellationPolicy,
        },
        select: tenantSettingsSelect,
      });

      return NextResponse.json({ ok: true, settings: serializeSettings(settings) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError("slug_unavailable", 409);
      }

      if (isMissingRecordError(error)) {
        return jsonError("tenant_not_found", 404);
      }

      throw error;
    }
  });
}
