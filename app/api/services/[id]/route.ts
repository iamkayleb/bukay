import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { updateServiceSchema } from "@/app/lib/services/schemas";
import {
  serviceWriteData,
  isMissingRecordError,
  isUniqueConstraintError,
  jsonError,
  readJson,
  runForTenant,
  serializeService,
  validationError,
} from "../_helpers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

async function findTenantService(tenantId: string, id: string) {
  return prisma.service.findFirst({
    where: { tenantId, id },
  });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  return runForTenant(req, async (tenantId) => {
    const service = await findTenantService(tenantId, params.id);

    if (!service) {
      return jsonError("service_not_found", 404);
    }

    return NextResponse.json({ ok: true, service: serializeService(service) });
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = updateServiceSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const existingService = await findTenantService(tenantId, params.id);
      if (!existingService) {
        return jsonError("service_not_found", 404);
      }

      const service = await prisma.service.update({
        where: { id: existingService.id, tenantId },
        data: serviceWriteData(parsed.data),
      });

      return NextResponse.json({ ok: true, service: serializeService(service) });
    } catch (error) {
      if (isMissingRecordError(error)) {
        return jsonError("service_not_found", 404);
      }

      if (isUniqueConstraintError(error)) {
        return jsonError("service_name_conflict", 409);
      }

      throw error;
    }
  });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return runForTenant(req, async (tenantId) => {
    try {
      const existingService = await findTenantService(tenantId, params.id);
      if (!existingService) {
        return jsonError("service_not_found", 404);
      }

      const service = await prisma.service.update({
        where: { id: existingService.id, tenantId },
        data: { active: false },
      });

      return NextResponse.json({ ok: true, service: serializeService(service) });
    } catch (error) {
      if (isMissingRecordError(error)) {
        return jsonError("service_not_found", 404);
      }

      throw error;
    }
  });
}
