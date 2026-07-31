import { NextRequest, NextResponse } from "next/server";

import { jsonError, readJson, runForTenant, validationError } from "@/app/api/services/_helpers";
import { createLogoUploadTarget, logoUploadRequestSchema } from "@/app/lib/settings/logo-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = logoUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      return NextResponse.json({
        ok: true,
        upload: createLogoUploadTarget(tenantId, parsed.data),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "object_storage_not_configured") {
        return jsonError("object_storage_not_configured", 503);
      }

      throw error;
    }
  });
}
