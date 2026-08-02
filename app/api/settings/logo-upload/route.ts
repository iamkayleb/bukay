import { NextRequest, NextResponse } from "next/server";

import { jsonError, readJson, runForTenant, validationError } from "@/app/api/services/_helpers";
import {
  createLogoUploadSchema,
  createS3LogoUpload,
  loadS3LogoUploadConfig,
} from "@/app/lib/storage/s3-logo-upload";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = createLogoUploadSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const upload = createS3LogoUpload(
        tenantId,
        parsed.data,
        loadS3LogoUploadConfig(process.env)
      );

      return NextResponse.json({ ok: true, upload });
    } catch (error) {
      if (error instanceof Error && error.message === "S3 logo upload is not configured") {
        return jsonError("logo_upload_not_configured", 503);
      }

      throw error;
    }
  });
}
