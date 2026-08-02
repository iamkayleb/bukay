import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { jsonError, runForTenant } from "@/app/api/services/_helpers";

export const dynamic = "force-dynamic";

type CalendarBookingRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  client?: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
  service?: {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    currency: string;
  };
  staff?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
};

const bookingDelegate = prisma.booking as unknown as {
  findMany(args: unknown): Promise<CalendarBookingRecord[]>;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = parseOptionalDate(searchParams.get("start"));
  const end = parseOptionalDate(searchParams.get("end"));

  if (start === false || end === false) {
    return jsonError("invalid_calendar_range", 422);
  }

  if (start && end && end <= start) {
    return jsonError("invalid_calendar_range", 422);
  }

  return runForTenant(req, async (tenantId) => {
    const rangeFilter =
      start || end
        ? {
            ...(end ? { startsAt: { lt: end } } : {}),
            ...(start ? { endsAt: { gt: start } } : {}),
          }
        : {};

    const bookings = await bookingDelegate.findMany({
      where: {
        tenantId,
        ...rangeFilter,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            priceCents: true,
            currency: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ ok: true, bookings: bookings.map(serializeCalendarBooking) });
  });
}

function parseOptionalDate(value: string | null): Date | null | false {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? false : date;
}

function serializeCalendarBooking(booking: CalendarBookingRecord) {
  return {
    ...booking,
    startsAt: serializeDate(booking.startsAt),
    endsAt: serializeDate(booking.endsAt),
    createdAt: serializeDate(booking.createdAt),
    updatedAt: serializeDate(booking.updatedAt),
  };
}

function serializeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
