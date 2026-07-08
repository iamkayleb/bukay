import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { updateAvailabilitySchema } from "@/app/lib/availability/schemas";
import { jsonError, readJson, runForTenant, validationError } from "@/app/api/services/_helpers";

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

const availabilityDelegate = prisma as unknown as {
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
  $transaction<T>(actions: Promise<T>[]): Promise<T[]>;
};

function serializeBusinessHour(row: BusinessHourRecord) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    dayOfWeek: row.dayOfWeek,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
  };
}

function serializeBlackout(row: BlackoutRecord) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    date: row.date,
    reason: row.reason ?? "",
  };
}

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const [businessHours, blackouts] = await Promise.all([
      availabilityDelegate.businessHour.findMany({
        where: { tenantId },
        orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }, { closesAt: "asc" }],
      }),
      availabilityDelegate.blackout.findMany({
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

  const parsed = updateAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    const duplicateWindow = parsed.data.businessHours.find((window, index, allWindows) =>
      allWindows.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          candidate.dayOfWeek === window.dayOfWeek &&
          candidate.opensAt === window.opensAt &&
          candidate.closesAt === window.closesAt
      )
    );

    if (duplicateWindow) {
      return jsonError("duplicate_business_hour", 409);
    }

    const duplicateBlackout = parsed.data.blackouts.find((blackout, index, allBlackouts) =>
      allBlackouts.some(
        (candidate, candidateIndex) => candidateIndex !== index && candidate.date === blackout.date
      )
    );

    if (duplicateBlackout) {
      return jsonError("duplicate_blackout", 409);
    }

    await availabilityDelegate.$transaction([
      availabilityDelegate.businessHour.deleteMany({ where: { tenantId } }),
      availabilityDelegate.blackout.deleteMany({ where: { tenantId } }),
      availabilityDelegate.businessHour.createMany({
        data: parsed.data.businessHours.map((window) => ({
          tenantId,
          dayOfWeek: window.dayOfWeek,
          opensAt: window.opensAt,
          closesAt: window.closesAt,
        })),
      }),
      availabilityDelegate.blackout.createMany({
        data: parsed.data.blackouts.map((blackout) => ({
          tenantId,
          date: blackout.date,
          reason: blackout.reason?.trim() || null,
        })),
      }),
    ]);

    const [businessHours, blackouts] = await Promise.all([
      availabilityDelegate.businessHour.findMany({
        where: { tenantId },
        orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }, { closesAt: "asc" }],
      }),
      availabilityDelegate.blackout.findMany({
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
