import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import {
  isMissingRecordError,
  isUniqueConstraintError,
  jsonError,
  readJson,
  runForTenant,
  validationError,
} from "@/app/api/_helpers";
import { blackoutCreateSchema, blackoutDeleteSchema } from "@/app/lib/schedule/schemas";
import { normalizeIsoDate } from "@/app/lib/schedule/iso-date";

export const dynamic = "force-dynamic";

// GET /api/blackout
// Lists every blackout for the current tenant, ordered by date. Optional
// `from`/`to` query params clip to a range so the OwnerSchedule UI can show
// just the visible calendar window.
export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    let from: string | undefined;
    let to: string | undefined;
    try {
      if (fromParam) from = normalizeIsoDate(fromParam);
      if (toParam) to = normalizeIsoDate(toParam);
    } catch {
      return jsonError("invalid_date_range", 400);
    }

    const rows = await prisma.blackout.findMany({
      where: {
        tenantId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
      select: { id: true, date: true, reason: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({
      ok: true,
      blackouts: rows.map((r) => ({
        id: r.id,
        date: r.date,
        reason: r.reason,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      })),
    });
  });
}

// POST /api/blackout
// Adds a blackout for a single date. Body: { date, reason? }. The date is
// normalized to YYYY-MM-DD before write. A duplicate (same tenant + date)
// returns 409 rather than a generic 500.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = blackoutCreateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const row = await prisma.blackout.create({
        data: {
          tenantId,
          date: parsed.data.date,
          reason: parsed.data.reason ?? null,
        },
        select: { id: true, date: true, reason: true, createdAt: true, updatedAt: true },
      });

      return NextResponse.json(
        {
          ok: true,
          blackout: {
            id: row.id,
            date: row.date,
            reason: row.reason,
            createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
            updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError("blackout_date_conflict", 409);
      }
      throw error;
    }
  });
}

// DELETE /api/blackout
// Removes a blackout by date. Body: { date }. Returns 404 if no matching row
// exists so the client can distinguish idempotent no-op from success.
export async function DELETE(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = blackoutDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      await prisma.blackout.delete({
        where: {
          tenantId_date: { tenantId, date: parsed.data.date },
        },
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (isMissingRecordError(error)) {
        return jsonError("blackout_not_found", 404);
      }
      throw error;
    }
  });
}
