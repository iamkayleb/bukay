import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/db/prisma";
import { jsonError, runForTenant } from "../services/_helpers";
export const dynamic = "force-dynamic";
// Date-only bounds include both UTC dates; timestamp bounds use [from, to).
function bound(value: string | null, upper: boolean): Date | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
  )
    return null;
  const calendarDate = value.slice(0, 10);
  const midnight = new Date(`${calendarDate}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== calendarDate)
    return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (value.length === 10) {
    if (date.toISOString().slice(0, 10) !== value) return null;
    if (upper) date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}
export async function GET(req: NextRequest) {
  const from = bound(req.nextUrl.searchParams.get("from"), false);
  const to = bound(req.nextUrl.searchParams.get("to"), true);
  if (!from || !to || from >= to) return jsonError("invalid_date_range", 400);
  return runForTenant(req, async (tenantId) => {
    const bookings = await prisma.booking.findMany({
      where: { tenantId, startsAt: { gte: from, lt: to } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        client: { select: { name: true } },
        service: { select: { name: true } },
      },
    });
    return NextResponse.json({ ok: true, bookings });
  });
}
