import { z } from "zod";
import { computeSlots } from "@/app/lib/availability";
import { validateNigerianPhone, InvalidPhoneNumberError } from "@/app/lib/phone";
import { releaseExpiredHolds } from "@/app/lib/slot-hold";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/db/prisma";
import { jsonError, readJson, validationError, runForTenant } from "../services/_helpers";
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

const createSchema = z
  .object({
    serviceId: z.string().trim().min(1),
    startsAt: z.string().datetime({ offset: true }),
    clientId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    notes: z.string().trim().optional(),
  })
  .strict()
  .refine((value) => value.clientId || (value.name && value.phone), {
    message: "Choose a client or provide a name and phone number",
  });

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  let phone: string | undefined;
  if (!input.clientId && input.phone) {
    try {
      phone = validateNigerianPhone(input.phone);
    } catch (error) {
      if (error instanceof InvalidPhoneNumberError) return jsonError("invalid_phone", 422);
      throw error;
    }
  }
  return runForTenant(req, async (tenantId) => {
    // Retry a contending SQLite transaction so it checks the committed booking.
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const service = await tx.service.findFirst({
            where: { tenantId, id: input.serviceId, active: true },
          });
          if (!service) return jsonError("service_not_found", 404);
          const startsAt = new Date(input.startsAt);
          const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
          const day = new Date(startsAt);
          day.setUTCHours(0, 0, 0, 0);
          const hours = await tx.businessHour.findMany({ where: { tenantId } });
          const slots = computeSlots(
            service,
            { start: day, end: new Date(day.getTime() + 86400000) },
            [],
            hours
          );
          if (!slots.some((slot) => slot.startsAt.getTime() === startsAt.getTime()))
            return jsonError("outside_business_hours", 422);
          await releaseExpiredHolds(tx, tenantId, new Date());
          const overlap = await tx.booking.findFirst({
            where: {
              tenantId,
              serviceId: service.id,
              status: { not: "cancelled" },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
          });
          if (overlap) return jsonError("slot_unavailable", 409);
          const client = input.clientId
            ? await tx.client.findFirst({ where: { tenantId, id: input.clientId } })
            : await tx.client.upsert({
                where: { tenantId, tenantId_phone: { tenantId, phone: phone! } },
                update: {},
                create: { tenantId, name: input.name!, phone: phone! },
              });
          if (!client) return jsonError("client_not_found", 404);
          const booking = await tx.booking.create({
            data: {
              tenantId,
              serviceId: service.id,
              clientId: client.id,
              startsAt,
              endsAt,
              status: "confirmed",
              slotLock: null,
              notes: input.notes || null,
            },
          });
          return NextResponse.json({ ok: true, booking }, { status: 201 });
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (attempt < 2 && (code === "P2034" || code === "P1008" || code === "P2028")) continue;
        throw error;
      }
    }
  });
}
