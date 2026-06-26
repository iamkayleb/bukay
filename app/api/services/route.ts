import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { createServiceSchema } from "@/app/lib/services/schemas";
import {
  jsonError,
  readJson,
  runForTenant,
  serializeService,
  validationError,
  isUniqueConstraintError,
  type ServiceRecord,
} from "./_helpers";

export const dynamic = "force-dynamic";

const serviceDelegate = prisma.service as unknown as {
  findMany(args: unknown): Promise<ServiceRecord[]>;
  create(args: unknown): Promise<ServiceRecord>;
};

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const services = await serviceDelegate.findMany({
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
      const service = await serviceDelegate.create({
        data: {
          tenantId,
          name: parsed.data.name,
          durationMinutes: parsed.data.durationMinutes,
          priceKobo: parsed.data.priceKobo,
          bufferMinutes: parsed.data.bufferMinutes,
          active: parsed.data.active,
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
