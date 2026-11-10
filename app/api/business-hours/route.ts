import { NextRequest, NextResponse } from "next/server";

import { jsonError, readJson, runForTenant, validationError } from "@/app/api/services/_helpers";
import { prisma } from "@/app/db/prisma";
import { replaceBusinessHoursSchema, toStoredRow } from "@/app/lib/business-hours";

export const dynamic = "force-dynamic";

const rowSelect = {
  id: true,
  dayOfWeek: true,
  opensAt: true,
  closesAt: true,
  isClosed: true,
} as const;

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const hours = await prisma.businessHour.findMany({
      where: { tenantId },
      orderBy: { dayOfWeek: "asc" },
      select: rowSelect,
    });
    return NextResponse.json({ ok: true, hours });
  });
}

/**
 * Replace the tenant's weekly pattern. Rows are upserted by
 * (tenantId, dayOfWeek) inside one transaction so existing ids survive and a
 * failure leaves the previous pattern untouched.
 */
export async function PUT(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = replaceBusinessHoursSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const rows = parsed.data.hours.map(toStoredRow);

  return runForTenant(req, async (tenantId) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return jsonError("tenant_not_found", 404);
    }

    const hours = await prisma.$transaction(
      rows.map((row) =>
        prisma.businessHour.upsert({
          // Top-level tenantId keeps the tenant guard satisfied.
          where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: row.dayOfWeek }, tenantId },
          update: { opensAt: row.opensAt, closesAt: row.closesAt, isClosed: row.isClosed },
          create: { tenantId, ...row },
          select: rowSelect,
        })
      )
    );

    return NextResponse.json({ ok: true, hours });
  });
}
