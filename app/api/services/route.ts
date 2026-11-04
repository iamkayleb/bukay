import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { createServiceSchema } from "@/app/lib/services/schemas";
import {
  serviceWriteData,
  jsonError,
  readJson,
  runForTenant,
  serializeService,
  validationError,
  isUniqueConstraintError,
} from "./_helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const services = await prisma.service.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ ok: true, services: services.map(serializeService) });
  });
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const service = await prisma.service.create({
        data: {
          tenantId,
          ...serviceWriteData(parsed.data),
        },
      });

      return NextResponse.json({ ok: true, service: serializeService(service) }, { status: 201 });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError("service_name_conflict", 409);
      }

      throw error;
    }
  });
}
