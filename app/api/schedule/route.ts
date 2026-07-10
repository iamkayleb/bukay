import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { jsonError, readJson, runForTenant, validationError } from "@/app/api/_helpers";
import {
  scheduleUpdateSchema,
  type ScheduleUpdatePayload,
  type ScheduleWindow,
} from "@/app/lib/schedule/schemas";

export const dynamic = "force-dynamic";

// GET /api/schedule
// Returns the weekly schedule for the current tenant as
//   { ok: true, days: { "0": [...], "1": [...], ... } }
// Days with no rows are returned as empty arrays so the UI can render a full
// week without deriving keys from the response.
export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const rows = await prisma.businessHour.findMany({
      where: { tenantId, isClosed: false },
      orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
      select: { dayOfWeek: true, opensAt: true, closesAt: true },
    });

    const days: Record<string, ScheduleWindow[]> = {
      "0": [],
      "1": [],
      "2": [],
      "3": [],
      "4": [],
      "5": [],
      "6": [],
    };
    for (const row of rows) {
      days[String(row.dayOfWeek)]!.push({ opensAt: row.opensAt, closesAt: row.closesAt });
    }

    return NextResponse.json({ ok: true, days });
  });
}

// PUT /api/schedule
// Replaces the full weekly schedule in one transaction. Body:
//   { days: { "0": [{ opensAt, closesAt }, ...], "1": [...], ... } }
// Missing keys are treated as "closed all day" — the endpoint deletes every
// existing BusinessHour row for the tenant and reinserts the payload rather
// than trying to diff. Simpler to reason about and matches the OwnerSchedule
// UI which submits the whole week on save.
export async function PUT(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = scheduleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    const rows = flattenSchedule(tenantId, parsed.data);

    await prisma.$transaction([
      prisma.businessHour.deleteMany({ where: { tenantId } }),
      ...(rows.length > 0 ? [prisma.businessHour.createMany({ data: rows })] : []),
    ]);

    return GET(req);
  });
}

function flattenSchedule(tenantId: string, payload: ScheduleUpdatePayload) {
  const rows: Array<{
    tenantId: string;
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    isClosed: false;
  }> = [];
  for (const [key, windows] of Object.entries(payload.days)) {
    const dayOfWeek = Number(key);
    for (const win of windows) {
      rows.push({
        tenantId,
        dayOfWeek,
        opensAt: win.opensAt,
        closesAt: win.closesAt,
        isClosed: false,
      });
    }
  }
  // Deterministic order so tests can assert on it and so createMany batches
  // the rows in weekday/time order.
  rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt));
  return rows;
}

// jsonError re-exported for tests that assert the error contract without
// depending on the shared helpers module.
export { jsonError };
