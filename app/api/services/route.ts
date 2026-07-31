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

// Booking surfaces pass `?active=true` to hide archived services; admin views
// can pass `?active=false` to see only archived. Anything else (missing or
// unrecognized) returns every service scoped to the tenant.
//
// Contract for callers: every consumer that surfaces services to end users
// booking an appointment (client-facing form, staff calendar picker, public
// schedule) MUST include `?active=true`. See docs/DATA_MODEL.md → Service.
function parseActiveFilter(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const activeFilter = parseActiveFilter(req.nextUrl.searchParams.get("active"));

  return runForTenant(req, async (tenantId) => {
    const services = await serviceDelegate.findMany({
      where: { tenantId, ...(activeFilter === undefined ? {} : { active: activeFilter }) },
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
