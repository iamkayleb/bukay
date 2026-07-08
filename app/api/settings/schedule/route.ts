import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { updateScheduleSchema } from "@/app/lib/schedule/schemas";
import { readJson, runForTenant, validationError } from "@/app/api/services/_helpers";

export const dynamic = "force-dynamic";

type BusinessHourRecord = {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
};

type BlackoutRecord = {
  id: string;
  tenantId: string;
  date: string;
  reason: string | null;
};

const scheduleDb = prisma as unknown as {
  businessHour: {
    findMany(args: unknown): Promise<BusinessHourRecord[]>;
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  blackout: {
    findMany(args: unknown): Promise<BlackoutRecord[]>;
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  $transaction<T>(operations: Promise<T>[]): Promise<T[]>;
};

function serializeBusinessHour(hour: BusinessHourRecord) {
  return {
    id: hour.id,
    tenantId: hour.tenantId,
    dayOfWeek: hour.dayOfWeek,
    opensAt: hour.opensAt,
    closesAt: hour.closesAt,
  };
}

function serializeBlackout(blackout: BlackoutRecord) {
  return {
    id: blackout.id,
    tenantId: blackout.tenantId,
    date: blackout.date,
    reason: blackout.reason ?? "",
  };
}

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const [businessHours, blackouts] = await Promise.all([
      scheduleDb.businessHour.findMany({
        where: { tenantId },
        orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
      }),
      scheduleDb.blackout.findMany({
        where: { tenantId },
        orderBy: [{ date: "asc" }],
      }),
    ]);

    return NextResponse.json({
      ok: true,
      businessHours: businessHours.map(serializeBusinessHour),
      blackouts: blackouts.map(serializeBlackout),
    });
  });
}

export async function PUT(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = updateScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    const operations = [
      scheduleDb.businessHour.deleteMany({ where: { tenantId } }),
      scheduleDb.blackout.deleteMany({ where: { tenantId } }),
    ];

    if (parsed.data.businessHours.length > 0) {
      operations.push(
        scheduleDb.businessHour.createMany({
          data: parsed.data.businessHours.map((hour) => ({
            tenantId,
            dayOfWeek: hour.dayOfWeek,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
          })),
        })
      );
    }

    if (parsed.data.blackouts.length > 0) {
      operations.push(
        scheduleDb.blackout.createMany({
          data: parsed.data.blackouts.map((blackout) => ({
            tenantId,
            date: blackout.date,
            reason: blackout.reason.trim() || null,
          })),
        })
      );
    }

    await scheduleDb.$transaction(operations);

    return NextResponse.json({ ok: true });
  });
}
